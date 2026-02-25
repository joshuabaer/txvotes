// Token usage tracking — logs API token usage to KV for cost monitoring
//
// KV key: usage_log:{YYYY-MM-DD}
// Structure: { guide: { input: N, output: N, calls: N },
//              summary: { input: N, output: N, calls: N },
//              updater: { input: N, output: N, calls: N },
//              seeder: { input: N, output: N, calls: N } }

/**
 * Records token usage from an API response into the daily usage log.
 *
 * @param {object} env - Cloudflare Worker env bindings (needs ELECTION_DATA KV)
 * @param {string} component - "guide" | "summary" | "updater" | "seeder"
 * @param {object} usage - { input_tokens: N, output_tokens: N }
 * @param {string} model - Model name used for the call
 */
export async function logTokenUsage(env, component, usage, model) {
  if (!env?.ELECTION_DATA || !usage) return;

  const today = new Date().toISOString().slice(0, 10);
  const key = `usage_log:${today}`;

  try {
    const raw = await env.ELECTION_DATA.get(key);
    const log = raw ? JSON.parse(raw) : {};

    if (!log[component]) {
      log[component] = { input: 0, output: 0, calls: 0, models: {} };
    }

    log[component].input += (usage.input_tokens || 0);
    log[component].output += (usage.output_tokens || 0);
    log[component].calls += 1;

    // Track per-model breakdown
    if (model) {
      if (!log[component].models) log[component].models = {};
      if (!log[component].models[model]) {
        log[component].models[model] = { input: 0, output: 0, calls: 0 };
      }
      log[component].models[model].input += (usage.input_tokens || 0);
      log[component].models[model].output += (usage.output_tokens || 0);
      log[component].models[model].calls += 1;
    }

    // Update lastCall timestamp
    log[component].lastCall = new Date().toISOString();

    await env.ELECTION_DATA.put(key, JSON.stringify(log), { expirationTtl: 2592000 }); // 30 day TTL
  } catch (err) {
    // Non-fatal — don't let usage logging break the actual API call
    console.error("Usage logging error:", err.message);
  }
}

/**
 * Retrieves the usage log for a given date.
 *
 * @param {object} env - Cloudflare Worker env bindings
 * @param {string} [date] - YYYY-MM-DD, defaults to today
 * @returns {object} The usage log, or empty object if none exists
 */
export async function getUsageLog(env, date) {
  const d = date || new Date().toISOString().slice(0, 10);
  const key = `usage_log:${d}`;
  const raw = await env.ELECTION_DATA.get(key);
  if (!raw) return {};
  return JSON.parse(raw);
}

/**
 * Estimates cost from token usage using Anthropic pricing.
 * Sonnet: $3/M input, $15/M output
 * Haiku: $0.25/M input, $1.25/M output
 *
 * @param {object} usageLog - Daily usage log object
 * @returns {object} Cost breakdown by component + total
 */
export function estimateCost(usageLog) {
  const costs = {};
  let totalCost = 0;

  for (const [component, data] of Object.entries(usageLog)) {
    let componentCost = 0;

    if (data.models) {
      for (const [model, modelData] of Object.entries(data.models)) {
        // Default to Sonnet pricing
        let inputRate = 3.0;   // $ per million tokens
        let outputRate = 15.0;
        if (model.includes("haiku")) {
          inputRate = 0.25;
          outputRate = 1.25;
        } else if (model.includes("gpt-4o")) {
          inputRate = 2.5;
          outputRate = 10.0;
        } else if (model.includes("gemini")) {
          inputRate = 0.15;
          outputRate = 0.60;
        } else if (model.includes("grok")) {
          inputRate = 3.0;
          outputRate = 15.0;
        }
        const cost = (modelData.input * inputRate + modelData.output * outputRate) / 1_000_000;
        componentCost += cost;
      }
    } else {
      // Fallback: assume Sonnet pricing if no model breakdown
      const cost = (data.input * 3.0 + data.output * 15.0) / 1_000_000;
      componentCost = cost;
    }

    costs[component] = Math.round(componentCost * 10000) / 10000; // round to 4 decimals
    totalCost += componentCost;
  }

  costs._total = Math.round(totalCost * 10000) / 10000;
  return costs;
}
