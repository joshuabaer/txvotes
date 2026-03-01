// Stats email — sends daily/hourly stats summary emails via Resend.
//
// Daily at 7am CT (13:00 UTC) — summary of previous 24h metrics.
// During the last 48 hours before election (March 1-3, 2026), switches to hourly.
//
// Uses Resend API (free tier: 100 emails/day). Requires RESEND_API_KEY secret.
// Reads from Analytics Engine and KV to collect metrics.

import { getUsageLog, estimateCost } from "./usage-logger.js";
import { checkBallotBalance } from "./balance-check.js";
import { ELECTION_SUFFIX } from "./state-config.js";

// Election date for frequency switching
const ELECTION_DATE = "2026-03-03";

// Email config
const FROM_EMAIL = "stats@usvotes.app";
const FROM_NAME = "Texas Votes Stats";
const TO_EMAILS = ["admin@usvotes.app", "josh@baer5.com"];

/**
 * Determine whether we should send stats emails hourly (last 48h before election)
 * or daily (normal schedule).
 *
 * @param {Date} [now] - Current time, defaults to new Date()
 * @returns {'hourly'|'daily'}
 */
export function getEmailFrequency(now) {
  const current = now || new Date();
  // Election day: March 3, 2026, polls close at 7 PM CT = 01:00 UTC March 4
  const pollsClose = new Date("2026-03-04T01:00:00Z");
  // 48 hours before polls close = March 2, 01:00 UTC = March 1, 7 PM CT
  const hourlyStart = new Date(pollsClose.getTime() - 48 * 60 * 60 * 1000);

  if (current >= hourlyStart && current <= pollsClose) {
    return "hourly";
  }
  return "daily";
}

/**
 * Determine whether a stats email should be sent for this cron invocation.
 * Daily mode: only send at the 13:00 UTC hour (7am CT).
 * Hourly mode: send every hour during the 48h window.
 *
 * @param {string} cronSchedule - The cron expression that triggered this run
 * @param {Date} [now] - Current time, defaults to new Date()
 * @returns {boolean}
 */
export function shouldSendEmail(cronSchedule, now) {
  const frequency = getEmailFrequency(now);

  if (frequency === "hourly") {
    // Send on every cron invocation during the hourly window
    return true;
  }

  // Daily mode: only send on the daily cron (13:00 UTC = 7am CT)
  const current = now || new Date();
  const hour = current.getUTCHours();
  return hour === 13;
}

/**
 * Collect stats data for the email from KV and Analytics Engine.
 *
 * @param {object} env - Cloudflare Worker env bindings
 * @param {object} [options] - Options
 * @param {Date} [options.now] - Current time for date calculations
 * @returns {object} Stats data for email template
 */
export async function collectEmailStats(env, options = {}) {
  const now = options.now || new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  const stats = {
    date: today,
    generatedAt: now.toISOString(),
    frequency: getEmailFrequency(now),
    guideGenerations: 0,
    uniqueVisitors: null,
    cacheHitRate: null,
    errorRate: null,
    balanceScore: null,
    completenessPercent: 0,
    totalRaces: 0,
    totalCandidates: 0,
    fairnessScore: null,
    apiCost: null,
    usageByComponent: {},
    cronStatus: null,
    errors: [],
  };

  // --- Load KV data in parallel ---
  try {
    const [
      repBallotRaw,
      demBallotRaw,
      auditSummaryRaw,
      usageTodayRaw,
      usageYesterdayRaw,
      cronStatusRaw,
      cronStatusYesterdayRaw,
    ] = await Promise.all([
      env.ELECTION_DATA.get("ballot:statewide:republican" + ELECTION_SUFFIX),
      env.ELECTION_DATA.get("ballot:statewide:democrat" + ELECTION_SUFFIX),
      env.ELECTION_DATA.get("audit:summary"),
      env.ELECTION_DATA.get(`usage_log:${today}`),
      env.ELECTION_DATA.get(`usage_log:${yesterday}`),
      env.ELECTION_DATA.get(`cron_status:${today}`),
      env.ELECTION_DATA.get(`cron_status:${yesterday}`),
    ]);

    // Parse ballots and compute quality metrics
    let repBallot = null;
    let demBallot = null;
    if (repBallotRaw) { try { repBallot = JSON.parse(repBallotRaw); } catch { stats.errors.push("repBallot: invalid JSON"); } }
    if (demBallotRaw) { try { demBallot = JSON.parse(demBallotRaw); } catch { stats.errors.push("demBallot: invalid JSON"); } }

    // Count races/candidates
    for (const b of [repBallot, demBallot]) {
      if (!b) continue;
      stats.totalRaces += (b.races || []).length;
      stats.totalCandidates += (b.races || []).reduce((s, r) => s + (r.candidates || []).length, 0);
    }

    // Candidate completeness
    const completenessFields = ["summary", "background", "keyPositions", "endorsements", "pros", "cons"];
    let totalFilled = 0;
    let totalPossible = 0;
    for (const b of [repBallot, demBallot]) {
      if (!b) continue;
      for (const race of (b.races || [])) {
        for (const c of (race.candidates || [])) {
          for (const f of completenessFields) {
            totalPossible++;
            const val = c[f];
            if (val !== undefined && val !== null && val !== "" && !(Array.isArray(val) && val.length === 0)) totalFilled++;
          }
        }
      }
    }
    stats.completenessPercent = totalPossible > 0 ? Math.round((totalFilled / totalPossible) * 100) : 0;

    // Balance score
    const balanceScores = [];
    for (const b of [repBallot, demBallot]) {
      if (!b) continue;
      try {
        const report = checkBallotBalance(b);
        balanceScores.push(report.summary.score);
      } catch { /* skip */ }
    }
    stats.balanceScore = balanceScores.length > 0
      ? Math.round(balanceScores.reduce((a, b) => a + b, 0) / balanceScores.length)
      : null;

    // Audit/fairness score
    if (auditSummaryRaw) {
      try {
        const audit = JSON.parse(auditSummaryRaw);
        stats.fairnessScore = audit.averageScore || null;
      } catch { stats.errors.push("audit: invalid JSON"); }
    }

    // Usage logs — prefer today, fall back to yesterday
    const usageRaw = usageTodayRaw || usageYesterdayRaw;
    if (usageRaw) {
      try {
        const usage = JSON.parse(usageRaw);
        stats.usageByComponent = usage;

        // Guide generations from usage log
        if (usage.guide) {
          stats.guideGenerations = usage.guide.calls || 0;
        }

        // Estimate API cost
        stats.apiCost = estimateCost(usage);
      } catch { stats.errors.push("usage: invalid JSON"); }
    }

    // Cron status
    const cronRaw = cronStatusRaw || cronStatusYesterdayRaw;
    if (cronRaw) {
      try { stats.cronStatus = JSON.parse(cronRaw); } catch { stats.errors.push("cronStatus: invalid JSON"); }
    }
  } catch (err) {
    stats.errors.push("KV read error: " + (err.message || String(err)));
  }

  // --- Analytics Engine queries (if credentials available) ---
  if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
    try {
      const aeData = await queryStatsFromAE(env);
      if (aeData) {
        if (aeData.guideGenerations !== undefined) stats.guideGenerations = aeData.guideGenerations;
        stats.uniqueVisitors = aeData.uniqueVisitors;
        stats.cacheHitRate = aeData.cacheHitRate;
        stats.errorRate = aeData.errorRate;
      }
    } catch (err) {
      stats.errors.push("AE query error: " + (err.message || String(err)));
    }
  }

  return stats;
}

/**
 * Query Analytics Engine for stats email metrics.
 * @param {object} env
 * @returns {object|null}
 */
async function queryStatsFromAE(env) {
  const ds = "usvotes_events";

  async function sq(sql) {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
      { method: "POST", headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` }, body: sql }
    );
    if (!resp.ok) return { data: [] };
    return resp.json();
  }

  const [guidesR, errorsR, cacheR] = await Promise.all([
    sq(`SELECT count() AS total FROM ${ds} WHERE timestamp > NOW() - INTERVAL '1' DAY AND blob1 = 'guide_complete' FORMAT JSON`),
    sq(`SELECT count() AS total FROM ${ds} WHERE timestamp > NOW() - INTERVAL '1' DAY AND blob1 = 'guide_error' FORMAT JSON`),
    sq(`SELECT blob1 AS event, count() AS total FROM ${ds} WHERE timestamp > NOW() - INTERVAL '1' DAY AND blob1 IN ('guide_complete','guide_cache_hit') GROUP BY event FORMAT JSON`),
  ]);

  const guides = (guidesR.data && guidesR.data[0]) ? Number(guidesR.data[0].total) || 0 : 0;
  const errors = (errorsR.data && errorsR.data[0]) ? Number(errorsR.data[0].total) || 0 : 0;

  // Cache hit rate
  let cacheHits = 0;
  let cacheMisses = 0;
  for (const row of (cacheR.data || [])) {
    if (row.event === "guide_cache_hit") cacheHits = Number(row.total) || 0;
    if (row.event === "guide_complete") cacheMisses = Number(row.total) || 0;
  }
  const totalRequests = cacheHits + cacheMisses;
  const cacheHitRate = totalRequests > 0 ? Math.round((cacheHits / totalRequests) * 100) : null;

  const errorRate = (guides + errors) > 0 ? Math.round((errors / (guides + errors)) * 100) : null;

  return {
    guideGenerations: guides,
    uniqueVisitors: null,
    cacheHitRate,
    errorRate,
  };
}

/**
 * Format stats data into an HTML email body.
 *
 * @param {object} stats - Stats data from collectEmailStats()
 * @returns {string} HTML email body
 */
export function formatStatsEmail(stats) {
  const isHourly = stats.frequency === "hourly";
  const periodLabel = isHourly ? "Hourly" : "Daily";
  const dateStr = new Date(stats.generatedAt).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  function metricRow(label, value, unit, color) {
    unit = unit || "";
    color = color || "";
    const colorStyle = color ? ` style="color:${color};font-weight:700"` : "";
    const displayVal = value !== null && value !== undefined ? `${value}${unit}` : "N/A";
    return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right"${colorStyle}>${displayVal}</td></tr>`;
  }

  function statusColor(score, thresholds) {
    thresholds = thresholds || [90, 70];
    if (score === null || score === undefined) return "";
    if (score >= thresholds[0]) return "#16a34a";
    if (score >= thresholds[1]) return "#b45309";
    return "#dc2626";
  }

  // Cron task rows
  let cronHtml = "";
  if (stats.cronStatus && stats.cronStatus.tasks) {
    const taskRows = Object.entries(stats.cronStatus.tasks).map(([name, t]) => {
      const icon = t.status === "success" ? "&#9989;" : "&#10060;";
      const detail = t.status === "error" ? ` — ${escapeHtmlEmail(t.error)}` : "";
      return `<tr><td style="padding:4px 12px;font-size:13px">${icon} ${escapeHtmlEmail(name)}</td><td style="padding:4px 12px;font-size:13px;color:#6b7280">${escapeHtmlEmail(t.status)}${detail}</td></tr>`;
    }).join("");
    cronHtml = `
    <h3 style="font-size:14px;color:#374151;margin:16px 0 8px">Last Cron Run</h3>
    <table style="width:100%;border-collapse:collapse">${taskRows}</table>`;
  }

  // API cost
  let costHtml = "";
  if (stats.apiCost && stats.apiCost._total > 0) {
    const costRows = Object.entries(stats.apiCost)
      .filter(([k]) => k !== "_total")
      .map(([component, cost]) => `<tr><td style="padding:4px 12px;font-size:13px;color:#6b7280">${escapeHtmlEmail(component)}</td><td style="padding:4px 12px;font-size:13px;text-align:right">$${cost.toFixed(4)}</td></tr>`)
      .join("");
    costHtml = `
    <h3 style="font-size:14px;color:#374151;margin:16px 0 8px">API Cost (Today)</h3>
    <table style="width:100%;border-collapse:collapse">
      ${costRows}
      <tr style="font-weight:700"><td style="padding:4px 12px;font-size:13px">Total</td><td style="padding:4px 12px;font-size:13px;text-align:right">$${stats.apiCost._total.toFixed(4)}</td></tr>
    </table>`;
  }

  // Errors
  let errorsHtml = "";
  if (stats.errors.length > 0) {
    errorsHtml = `
    <h3 style="font-size:14px;color:#dc2626;margin:16px 0 8px">Collection Errors</h3>
    <ul style="font-size:13px;color:#6b7280;padding-left:20px">${stats.errors.map(e => `<li>${escapeHtmlEmail(e)}</li>`).join("")}</ul>`;
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;padding:20px;margin:0">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
  <div style="background:rgb(33,89,143);padding:20px 24px;color:#fff">
    <h1 style="margin:0;font-size:20px;font-weight:700">${periodLabel} Stats Summary</h1>
    <p style="margin:4px 0 0;font-size:13px;opacity:0.85">${dateStr} CT</p>
  </div>
  <div style="padding:20px 24px">
    <h2 style="font-size:16px;color:rgb(33,89,143);margin:0 0 12px;border-bottom:2px solid rgb(33,89,143);padding-bottom:6px">Key Metrics</h2>
    <table style="width:100%;border-collapse:collapse">
      ${metricRow("Guide Generations", stats.guideGenerations)}
      ${metricRow("Cache Hit Rate", stats.cacheHitRate, "%", statusColor(stats.cacheHitRate, [50, 25]))}
      ${metricRow("Error Rate", stats.errorRate, "%", stats.errorRate !== null && stats.errorRate > 5 ? "#dc2626" : stats.errorRate !== null && stats.errorRate > 0 ? "#b45309" : "")}
      ${metricRow("Balance Score", stats.balanceScore, "/100", statusColor(stats.balanceScore))}
      ${metricRow("Candidate Completeness", stats.completenessPercent, "%", statusColor(stats.completenessPercent))}
      ${metricRow("AI Fairness Score", stats.fairnessScore, "/10", statusColor(stats.fairnessScore, [8, 6]))}
      ${metricRow("Races Tracked", stats.totalRaces)}
      ${metricRow("Candidates Profiled", stats.totalCandidates)}
    </table>

    ${cronHtml}
    ${costHtml}
    ${errorsHtml}

    <p style="font-size:12px;color:#9ca3af;margin:20px 0 0;text-align:center">
      <a href="https://txvotes.app/stats" style="color:rgb(33,89,143)">View Full Stats</a> &middot;
      <a href="https://txvotes.app/admin/hub" style="color:rgb(33,89,143)">Admin Hub</a>
    </p>
  </div>
</div>
</body>
</html>`;
}

/**
 * Escape HTML special characters for email content.
 */
function escapeHtmlEmail(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Send stats email via MailChannels API.
 * MailChannels is free for Cloudflare Workers when proper SPF DNS record is set.
 *
 * @param {object} stats - Stats data from collectEmailStats()
 * @param {object} [options] - Options
 * @param {string} [options.toEmail] - Override recipient
 * @param {string} [options.fromEmail] - Override sender
 * @returns {object} { success: boolean, status?: number, error?: string }
 */
export async function sendStatsEmail(stats, options = {}) {
  const to = (options && options.toEmail) ? [options.toEmail] : TO_EMAILS;
  const from = (options && options.fromEmail) || FROM_EMAIL;
  const apiKey = (options && options.apiKey) || null;
  const isHourly = stats.frequency === "hourly";
  const periodLabel = stats.frequency === "test" ? "Test" : isHourly ? "Hourly" : "Daily";

  const subject = `${periodLabel} Stats \u2014 Texas Votes \u2014 ${stats.date}`;
  const html = formatStatsEmail(stats);

  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const payload = {
    from: `${FROM_NAME} <${from}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (resp.status === 200) {
      const data = await resp.json();
      return { success: true, status: resp.status, id: data.id };
    }

    const text = await resp.text();
    return { success: false, status: resp.status, error: text };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Main entry point for the stats email cron task.
 * Called from the scheduled() handler in index.js.
 *
 * @param {object} env - Cloudflare Worker env bindings
 * @param {object} [options] - Options
 * @param {string} [options.cronSchedule] - The cron expression that triggered this
 * @param {Date} [options.now] - Current time (for testing)
 * @returns {object} Result summary
 */
export async function runStatsEmail(env, options = {}) {
  const now = (options && options.now) || new Date();

  // Check if we should send based on frequency
  if (!shouldSendEmail((options && options.cronSchedule) || "", now)) {
    return { sent: false, reason: "not scheduled for this hour" };
  }

  // Collect stats
  const stats = await collectEmailStats(env, { now });

  // Send email
  const result = await sendStatsEmail(stats, { apiKey: env.RESEND_API_KEY });

  return {
    sent: result.success,
    frequency: stats.frequency,
    status: result.status,
    error: result.error,
    guideGenerations: stats.guideGenerations,
    balanceScore: stats.balanceScore,
  };
}
