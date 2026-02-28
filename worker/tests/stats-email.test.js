import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import {
  getEmailFrequency,
  shouldSendEmail,
  collectEmailStats,
  formatStatsEmail,
  sendStatsEmail,
  runStatsEmail,
} from "../src/stats-email.js";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------
const sampleBallot = readFileSync(
  join(__dirname, "fixtures/sample-ballot.json"),
  "utf-8"
);

const sampleUsageLog = JSON.stringify({
  guide: { input: 50000, output: 5000, calls: 12, models: { "claude-sonnet-4-20250514": { input: 50000, output: 5000, calls: 12 } } },
  updater: { input: 100000, output: 10000, calls: 5, models: { "claude-sonnet-4-20250514": { input: 100000, output: 10000, calls: 5 } } },
});

const sampleCronStatus = JSON.stringify({
  timestamp: "2026-02-27T12:00:00Z",
  tasks: {
    dailyUpdate: { status: "success", updated: 5 },
    healthCheck: { status: "success", issueCount: 0 },
  },
});

const sampleAuditSummary = JSON.stringify({
  providers: {
    chatgpt: { overallScore: 8.5 },
    gemini: { overallScore: 9.0 },
    grok: { overallScore: 7.5 },
    claude: { overallScore: 8.0 },
  },
  averageScore: 8.25,
});

function buildMockEnv(kvOverrides = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const kvStore = {
    "ballot:statewide:republican_primary_2026": sampleBallot,
    "ballot:statewide:democrat_primary_2026": sampleBallot,
    "audit:summary": sampleAuditSummary,
    [`usage_log:${today}`]: sampleUsageLog,
    [`cron_status:${today}`]: sampleCronStatus,
    ...kvOverrides,
  };

  return {
    ELECTION_DATA: {
      get: async (key) => kvStore[key] || null,
      put: async () => {},
    },
    ADMIN_SECRET: "test-secret-123",
    ANTHROPIC_API_KEY: "sk-test",
  };
}

// ---------------------------------------------------------------------------
// getEmailFrequency
// ---------------------------------------------------------------------------
describe("getEmailFrequency", () => {
  it("returns 'daily' for normal days (weeks before election)", () => {
    const feb15 = new Date("2026-02-15T12:00:00Z");
    expect(getEmailFrequency(feb15)).toBe("daily");
  });

  it("returns 'daily' for January 2026", () => {
    const jan = new Date("2026-01-10T08:00:00Z");
    expect(getEmailFrequency(jan)).toBe("daily");
  });

  it("returns 'hourly' on March 2, 2026 at noon UTC (within 48h window)", () => {
    const march2 = new Date("2026-03-02T12:00:00Z");
    expect(getEmailFrequency(march2)).toBe("hourly");
  });

  it("returns 'hourly' on March 3, 2026 at 6pm CT (election day, before polls close)", () => {
    // 6pm CT = midnight UTC on March 4
    const electionDay = new Date("2026-03-04T00:00:00Z");
    expect(getEmailFrequency(electionDay)).toBe("hourly");
  });

  it("returns 'hourly' exactly at hourlyStart boundary (March 2 01:00 UTC)", () => {
    const boundary = new Date("2026-03-02T01:00:00Z");
    expect(getEmailFrequency(boundary)).toBe("hourly");
  });

  it("returns 'daily' just before the 48h window (March 2 00:59 UTC)", () => {
    const justBefore = new Date("2026-03-02T00:59:59Z");
    expect(getEmailFrequency(justBefore)).toBe("daily");
  });

  it("returns 'daily' after polls close (March 4 02:00 UTC)", () => {
    const afterPolls = new Date("2026-03-04T02:00:00Z");
    expect(getEmailFrequency(afterPolls)).toBe("daily");
  });

  it("returns 'hourly' exactly at polls close (March 4 01:00 UTC)", () => {
    const atPollsClose = new Date("2026-03-04T01:00:00Z");
    expect(getEmailFrequency(atPollsClose)).toBe("hourly");
  });
});

// ---------------------------------------------------------------------------
// shouldSendEmail
// ---------------------------------------------------------------------------
describe("shouldSendEmail", () => {
  it("returns true at 13:00 UTC in daily mode", () => {
    const at13 = new Date("2026-02-15T13:00:00Z");
    expect(shouldSendEmail("0 * * * *", at13)).toBe(true);
  });

  it("returns false at 14:00 UTC in daily mode", () => {
    const at14 = new Date("2026-02-15T14:00:00Z");
    expect(shouldSendEmail("0 * * * *", at14)).toBe(false);
  });

  it("returns false at 12:00 UTC in daily mode", () => {
    const at12 = new Date("2026-02-15T12:00:00Z");
    expect(shouldSendEmail("0 * * * *", at12)).toBe(false);
  });

  it("returns true at any hour during election window (hourly mode)", () => {
    const march2_5am = new Date("2026-03-02T05:00:00Z");
    expect(shouldSendEmail("0 * * * *", march2_5am)).toBe(true);

    const march2_22pm = new Date("2026-03-02T22:00:00Z");
    expect(shouldSendEmail("0 * * * *", march2_22pm)).toBe(true);

    const march3_noon = new Date("2026-03-03T12:00:00Z");
    expect(shouldSendEmail("0 * * * *", march3_noon)).toBe(true);
  });

  it("returns true during hourly mode regardless of cron schedule string", () => {
    const march2 = new Date("2026-03-02T10:00:00Z");
    expect(shouldSendEmail("anything", march2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// collectEmailStats
// ---------------------------------------------------------------------------
describe("collectEmailStats", () => {
  it("collects stats from KV data", async () => {
    const env = buildMockEnv();
    const stats = await collectEmailStats(env, { now: new Date() });

    expect(stats.date).toBeTruthy();
    expect(stats.generatedAt).toBeTruthy();
    expect(stats.frequency).toBe("daily");
    expect(stats.totalRaces).toBeGreaterThan(0);
    expect(stats.totalCandidates).toBeGreaterThan(0);
    expect(stats.guideGenerations).toBe(12);
    expect(stats.fairnessScore).toBe(8.25);
    expect(stats.apiCost).toBeTruthy();
    expect(stats.apiCost._total).toBeGreaterThan(0);
    expect(stats.errors).toHaveLength(0);
  });

  it("handles missing ballots gracefully", async () => {
    const env = buildMockEnv({
      "ballot:statewide:republican_primary_2026": null,
      "ballot:statewide:democrat_primary_2026": null,
    });
    const stats = await collectEmailStats(env, { now: new Date() });

    expect(stats.totalRaces).toBe(0);
    expect(stats.totalCandidates).toBe(0);
    expect(stats.completenessPercent).toBe(0);
    expect(stats.balanceScore).toBeNull();
    expect(stats.errors).toHaveLength(0);
  });

  it("handles missing audit summary gracefully", async () => {
    const env = buildMockEnv({ "audit:summary": null });
    const stats = await collectEmailStats(env, { now: new Date() });

    expect(stats.fairnessScore).toBeNull();
    expect(stats.errors).toHaveLength(0);
  });

  it("handles missing usage log gracefully", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const env = buildMockEnv({
      [`usage_log:${today}`]: null,
      [`usage_log:${yesterday}`]: null,
    });
    const stats = await collectEmailStats(env, { now: new Date() });

    expect(stats.guideGenerations).toBe(0);
    expect(stats.apiCost).toBeNull();
    expect(stats.errors).toHaveLength(0);
  });

  it("sets frequency to hourly during election window", async () => {
    const env = buildMockEnv();
    const march2 = new Date("2026-03-02T12:00:00Z");
    const stats = await collectEmailStats(env, { now: march2 });

    expect(stats.frequency).toBe("hourly");
  });

  it("handles KV read errors gracefully", async () => {
    const env = {
      ELECTION_DATA: {
        get: async () => { throw new Error("KV unavailable"); },
        put: async () => {},
      },
    };
    const stats = await collectEmailStats(env, { now: new Date() });

    expect(stats.errors.length).toBeGreaterThan(0);
    expect(stats.errors[0]).toContain("KV");
  });

  it("computes completeness percentage from ballot data", async () => {
    const env = buildMockEnv();
    const stats = await collectEmailStats(env, { now: new Date() });

    expect(stats.completenessPercent).toBeGreaterThanOrEqual(0);
    expect(stats.completenessPercent).toBeLessThanOrEqual(100);
  });

  it("includes cron status when available", async () => {
    const env = buildMockEnv();
    const stats = await collectEmailStats(env, { now: new Date() });

    expect(stats.cronStatus).toBeTruthy();
    expect(stats.cronStatus.tasks).toBeTruthy();
    expect(stats.cronStatus.tasks.dailyUpdate.status).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// formatStatsEmail
// ---------------------------------------------------------------------------
describe("formatStatsEmail", () => {
  const baseStats = {
    date: "2026-02-28",
    generatedAt: "2026-02-28T13:00:00Z",
    frequency: "daily",
    guideGenerations: 42,
    uniqueVisitors: null,
    cacheHitRate: 65,
    errorRate: 2,
    balanceScore: 88,
    completenessPercent: 91,
    totalRaces: 30,
    totalCandidates: 120,
    fairnessScore: 8.25,
    apiCost: { guide: 0.45, updater: 0.30, _total: 0.75 },
    usageByComponent: {},
    cronStatus: {
      timestamp: "2026-02-28T12:00:00Z",
      tasks: { dailyUpdate: { status: "success" }, healthCheck: { status: "success", issueCount: 0 } },
    },
    errors: [],
  };

  it("produces valid HTML email", () => {
    const html = formatStatsEmail(baseStats);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("Daily Stats Summary");
  });

  it("includes key metric values", () => {
    const html = formatStatsEmail(baseStats);
    expect(html).toContain("Guide Generations");
    expect(html).toContain("42");
    expect(html).toContain("Cache Hit Rate");
    expect(html).toContain("65%");
    expect(html).toContain("Balance Score");
    expect(html).toContain("88/100");
    expect(html).toContain("AI Fairness Score");
    expect(html).toContain("8.25/10");
    expect(html).toContain("Races Tracked");
    expect(html).toContain("30");
    expect(html).toContain("Candidates Profiled");
    expect(html).toContain("120");
  });

  it("includes cron status section", () => {
    const html = formatStatsEmail(baseStats);
    expect(html).toContain("Last Cron Run");
    expect(html).toContain("dailyUpdate");
    expect(html).toContain("healthCheck");
  });

  it("includes API cost section", () => {
    const html = formatStatsEmail(baseStats);
    expect(html).toContain("API Cost");
    expect(html).toContain("$0.7500");
  });

  it("shows 'Hourly' label during election window", () => {
    const hourlyStats = { ...baseStats, frequency: "hourly" };
    const html = formatStatsEmail(hourlyStats);
    expect(html).toContain("Hourly Stats Summary");
  });

  it("handles null metric values with N/A", () => {
    const nullStats = {
      ...baseStats,
      cacheHitRate: null,
      errorRate: null,
      balanceScore: null,
      fairnessScore: null,
    };
    const html = formatStatsEmail(nullStats);
    // Multiple N/A values should be present
    const naCount = (html.match(/N\/A/g) || []).length;
    expect(naCount).toBeGreaterThanOrEqual(3);
  });

  it("shows error section when errors exist", () => {
    const errorStats = {
      ...baseStats,
      errors: ["KV read error: timeout", "AE query failed"],
    };
    const html = formatStatsEmail(errorStats);
    expect(html).toContain("Collection Errors");
    expect(html).toContain("KV read error: timeout");
    expect(html).toContain("AE query failed");
  });

  it("omits cron section when no cron status", () => {
    const noCronStats = { ...baseStats, cronStatus: null };
    const html = formatStatsEmail(noCronStats);
    expect(html).not.toContain("Last Cron Run");
  });

  it("omits cost section when no API cost", () => {
    const noCostStats = { ...baseStats, apiCost: null };
    const html = formatStatsEmail(noCostStats);
    expect(html).not.toContain("API Cost");
  });

  it("includes links to stats page and admin hub", () => {
    const html = formatStatsEmail(baseStats);
    expect(html).toContain("https://txvotes.app/stats");
    expect(html).toContain("https://txvotes.app/admin/hub");
  });

  it("escapes HTML in error messages", () => {
    const xssStats = {
      ...baseStats,
      errors: ['<script>alert("xss")</script>'],
    };
    const html = formatStatsEmail(xssStats);
    expect(html).not.toContain('<script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses color coding for high balance score", () => {
    const html = formatStatsEmail({ ...baseStats, balanceScore: 95 });
    expect(html).toContain("#16a34a"); // green
  });

  it("uses color coding for low balance score", () => {
    const html = formatStatsEmail({ ...baseStats, balanceScore: 50 });
    expect(html).toContain("#dc2626"); // red
  });
});

// ---------------------------------------------------------------------------
// sendStatsEmail
// ---------------------------------------------------------------------------
describe("sendStatsEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends email via MailChannels API with correct payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 202,
      text: async () => "Accepted",
    });
    vi.stubGlobal("fetch", mockFetch);

    const stats = {
      date: "2026-02-28",
      generatedAt: "2026-02-28T13:00:00Z",
      frequency: "daily",
      guideGenerations: 10,
      cacheHitRate: null,
      errorRate: null,
      balanceScore: 90,
      completenessPercent: 85,
      totalRaces: 20,
      totalCandidates: 80,
      fairnessScore: 8.0,
      apiCost: null,
      cronStatus: null,
      errors: [],
    };

    const result = await sendStatsEmail(stats);

    expect(result.success).toBe(true);
    expect(result.status).toBe(202);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.mailchannels.net/tx/v1/send");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.from.email).toBe("stats@txvotes.app");
    expect(body.personalizations[0].to[0].email).toBe("admin@usvotes.app");
    expect(body.subject).toContain("Daily Stats");
    expect(body.content[0].type).toBe("text/html");
  });

  it("handles MailChannels failure gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 400,
      text: async () => "Bad request",
    }));

    const stats = {
      date: "2026-02-28",
      generatedAt: "2026-02-28T13:00:00Z",
      frequency: "daily",
      guideGenerations: 0,
      cacheHitRate: null,
      errorRate: null,
      balanceScore: null,
      completenessPercent: 0,
      totalRaces: 0,
      totalCandidates: 0,
      fairnessScore: null,
      apiCost: null,
      cronStatus: null,
      errors: [],
    };

    const result = await sendStatsEmail(stats);

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toBe("Bad request");
  });

  it("handles network errors gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network timeout")));

    const stats = {
      date: "2026-02-28",
      generatedAt: "2026-02-28T13:00:00Z",
      frequency: "daily",
      guideGenerations: 0,
      cacheHitRate: null,
      errorRate: null,
      balanceScore: null,
      completenessPercent: 0,
      totalRaces: 0,
      totalCandidates: 0,
      fairnessScore: null,
      apiCost: null,
      cronStatus: null,
      errors: [],
    };

    const result = await sendStatsEmail(stats);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
  });

  it("uses custom recipient when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 202, text: async () => "" });
    vi.stubGlobal("fetch", mockFetch);

    const stats = {
      date: "2026-02-28",
      generatedAt: "2026-02-28T13:00:00Z",
      frequency: "daily",
      guideGenerations: 0,
      cacheHitRate: null,
      errorRate: null,
      balanceScore: null,
      completenessPercent: 0,
      totalRaces: 0,
      totalCandidates: 0,
      fairnessScore: null,
      apiCost: null,
      cronStatus: null,
      errors: [],
    };

    await sendStatsEmail(stats, { toEmail: "custom@example.com" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.personalizations[0].to[0].email).toBe("custom@example.com");
  });

  it("sets Hourly subject during election window", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 202, text: async () => "" });
    vi.stubGlobal("fetch", mockFetch);

    const stats = {
      date: "2026-03-02",
      generatedAt: "2026-03-02T12:00:00Z",
      frequency: "hourly",
      guideGenerations: 5,
      cacheHitRate: null,
      errorRate: null,
      balanceScore: null,
      completenessPercent: 0,
      totalRaces: 0,
      totalCandidates: 0,
      fairnessScore: null,
      apiCost: null,
      cronStatus: null,
      errors: [],
    };

    await sendStatsEmail(stats);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toContain("Hourly Stats");
  });
});

// ---------------------------------------------------------------------------
// runStatsEmail (integration)
// ---------------------------------------------------------------------------
describe("runStatsEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips sending when not scheduled for this hour", async () => {
    const env = buildMockEnv();
    // 14:00 UTC is not the scheduled hour for daily mode
    const at14 = new Date("2026-02-15T14:00:00Z");
    const result = await runStatsEmail(env, { now: at14 });

    expect(result.sent).toBe(false);
    expect(result.reason).toContain("not scheduled");
  });

  it("sends email at 13:00 UTC in daily mode", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 202, text: async () => "" });
    vi.stubGlobal("fetch", mockFetch);

    const env = buildMockEnv();
    const at13 = new Date("2026-02-15T13:00:00Z");
    const result = await runStatsEmail(env, { now: at13 });

    expect(result.sent).toBe(true);
    expect(result.frequency).toBe("daily");
  });

  it("sends email every hour during election window", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 202, text: async () => "" });
    vi.stubGlobal("fetch", mockFetch);

    const env = buildMockEnv();
    const march2 = new Date("2026-03-02T15:00:00Z");
    const result = await runStatsEmail(env, { now: march2 });

    expect(result.sent).toBe(true);
    expect(result.frequency).toBe("hourly");
  });

  it("includes guide generations in result", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 202, text: async () => "" });
    vi.stubGlobal("fetch", mockFetch);

    // Use a date whose usage_log key matches the mock KV data
    const now = new Date();
    now.setUTCHours(13, 0, 0, 0);
    const env = buildMockEnv();
    const result = await runStatsEmail(env, { now });

    expect(result.guideGenerations).toBe(12);
  });
});
