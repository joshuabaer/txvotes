import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PROVIDERS,
  buildAuditPrompt,
  buildSynthesisPrompt,
  parseAuditScores,
  validateScores,
  repairTruncatedJson,
  callProvider,
  runAudit,
  DIMENSION_KEYS,
} from "../src/audit-runner.js";

// ---------------------------------------------------------------------------
// Score parsing tests (~12 tests)
// ---------------------------------------------------------------------------
describe("parseAuditScores", () => {
  it("extracts scores from a JSON code fence", () => {
    const text = `Here is my analysis...
\`\`\`json
{"overallScore": 7.5, "dimensions": {"partisanBias": 8, "factualAccuracy": 7, "fairnessOfFraming": 8, "balanceOfProsCons": 7, "transparency": 9}, "topStrength": "Great transparency", "topWeakness": "Missing citations"}
\`\`\`
Thank you.`;
    const result = parseAuditScores(text);
    expect(result.success).toBe(true);
    expect(result.scores.overallScore).toBe(7.5);
    expect(result.scores.dimensions.partisanBias).toBe(8);
    expect(result.scores.dimensions.transparency).toBe(9);
    expect(result.scores.topStrength).toBe("Great transparency");
    expect(result.scores.topWeakness).toBe("Missing citations");
    expect(result.method).toBe("json_fence");
  });

  it("extracts scores from raw JSON without fences", () => {
    const text = `My report concludes with these scores:
{"overallScore": 8.2, "dimensions": {"partisanBias": 9, "factualAccuracy": 8, "fairnessOfFraming": 7, "balanceOfProsCons": 8, "transparency": 9}}
End of report.`;
    const result = parseAuditScores(text);
    expect(result.success).toBe(true);
    expect(result.scores.overallScore).toBe(8.2);
    expect(result.method).toBe("raw_json");
  });

  it("falls back to regex extraction from prose", () => {
    const text = `
## Scores

- Partisan Bias: 8/10
- Factual Accuracy: 7/10
- Fairness of Framing: 8.5/10
- Balance of Pros/Cons: 7/10
- Transparency: 9/10
`;
    const result = parseAuditScores(text);
    expect(result.success).toBe(true);
    expect(result.scores.dimensions.partisanBias).toBe(8);
    expect(result.scores.dimensions.factualAccuracy).toBe(7);
    expect(result.scores.dimensions.fairnessOfFraming).toBe(8.5);
    expect(result.scores.dimensions.transparency).toBe(9);
    expect(result.method).toBe("regex");
    // Average should be computed
    expect(result.scores.overallScore).toBeCloseTo(7.9, 1);
  });

  it("handles scores with 'out of 10' format", () => {
    const text = `
Partisan Bias: 8 out of 10
Factual Accuracy: 7 out of 10
Fairness of Framing: 6 out of 10
`;
    const result = parseAuditScores(text);
    expect(result.success).toBe(true);
    expect(result.scores.dimensions.partisanBias).toBe(8);
    expect(result.scores.dimensions.factualAccuracy).toBe(7);
    expect(result.scores.dimensions.fairnessOfFraming).toBe(6);
    expect(result.method).toBe("regex");
  });

  it("returns failure for empty text", () => {
    expect(parseAuditScores("").success).toBe(false);
    expect(parseAuditScores(null).success).toBe(false);
    expect(parseAuditScores(undefined).success).toBe(false);
  });

  it("returns failure when fewer than 3 dimensions found by regex", () => {
    const text = "Partisan Bias: 8/10. That's all I have.";
    const result = parseAuditScores(text);
    expect(result.success).toBe(false);
  });

  it("rejects scores outside 1-10 range in JSON", () => {
    const text = '```json\n{"overallScore": 15, "dimensions": {"partisanBias": 8}}\n```';
    const result = parseAuditScores(text);
    // Should fall through to tier 2/3 since overallScore > 10
    expect(result.scores?.overallScore).not.toBe(15);
  });

  it("rejects scores outside 1-10 range in regex", () => {
    const text = `
Partisan Bias: 15/10
Factual Accuracy: 0/10
Fairness of Framing: -5/10
`;
    const result = parseAuditScores(text);
    expect(result.success).toBe(false);
  });

  it("prefers JSON fence over raw JSON when both exist", () => {
    const text = `
{"overallScore": 5, "dimensions": {"partisanBias": 5}}
\`\`\`json
{"overallScore": 8, "dimensions": {"partisanBias": 8, "factualAccuracy": 7, "fairnessOfFraming": 8, "balanceOfProsCons": 7, "transparency": 9}, "topStrength": "Good", "topWeakness": "Bad"}
\`\`\``;
    const result = parseAuditScores(text);
    expect(result.success).toBe(true);
    expect(result.scores.overallScore).toBe(8);
    expect(result.method).toBe("json_fence");
  });

  it("handles multiline JSON in code fence", () => {
    const text = `Report done.
\`\`\`json
{
  "overallScore": 7.0,
  "dimensions": {
    "partisanBias": 8,
    "factualAccuracy": 6,
    "fairnessOfFraming": 7,
    "balanceOfProsCons": 7,
    "transparency": 8
  },
  "topStrength": "Transparent approach",
  "topWeakness": "Needs citations"
}
\`\`\``;
    const result = parseAuditScores(text);
    expect(result.success).toBe(true);
    expect(result.scores.overallScore).toBe(7.0);
    expect(result.scores.dimensions.factualAccuracy).toBe(6);
  });

  it("handles text with no extractable scores at all", () => {
    const text = "This is a great app with no obvious issues. I recommend continued monitoring.";
    const result = parseAuditScores(text);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("repairs truncated JSON from a code fence that was cut off", () => {
    const text = `Here is my audit report. Great app overall.

\`\`\`json
{"overallScore": 8.6, "dimensions": {"partisanBias": 9, "factualAccuracy": 8, "fairnessOfFraming": 8, "balanceOfProsCons": 8, "transparency": 10}, "topStrength": "Excellent transparency", "topWeak`;
    const result = parseAuditScores(text);
    expect(result.success).toBe(true);
    expect(result.scores.overallScore).toBe(8.6);
    expect(result.scores.dimensions.partisanBias).toBe(9);
    expect(result.scores.dimensions.transparency).toBe(10);
    expect(result.scores.topStrength).toBe("Excellent transparency");
    expect(result.method).toBe("json_repaired");
  });

  it("repairs truncated JSON missing closing braces entirely", () => {
    const text = `Report done.
\`\`\`json
{"overallScore": 7.0, "dimensions": {"partisanBias": 7, "factualAccuracy": 6, "fairnessOfFraming": 7, "balanceOfProsCons": 7, "transparency": 8`;
    const result = parseAuditScores(text);
    expect(result.success).toBe(true);
    expect(result.scores.overallScore).toBe(7.0);
    expect(result.scores.dimensions.factualAccuracy).toBe(6);
    expect(result.method).toBe("json_repaired");
  });

  it("repairs bare truncated JSON without code fence", () => {
    const text = `My scores: {"overallScore": 9.0, "dimensions": {"partisanBias": 9, "factualAccuracy": 9, "fairnessOfFraming": 9, "balanceOfProsCons": 8, "transparency": 10}, "topStre`;
    const result = parseAuditScores(text);
    expect(result.success).toBe(true);
    expect(result.scores.overallScore).toBe(9.0);
    expect(result.scores.dimensions.balanceOfProsCons).toBe(8);
    expect(result.method).toBe("json_repaired");
  });

  it("extracts scores from markdown table format using pipe regex", () => {
    const text = `
| Dimension | Score |
|-----------|-------|
| Partisan Bias | 8/10 |
| Factual Accuracy | 7/10 |
| Fairness of Framing | 8/10 |
| Balance of Pros/Cons | 7/10 |
| Transparency | 9/10 |
`;
    const result = parseAuditScores(text);
    expect(result.success).toBe(true);
    expect(result.scores.dimensions.partisanBias).toBe(8);
    expect(result.scores.dimensions.transparency).toBe(9);
    expect(result.method).toBe("regex");
  });
});

// ---------------------------------------------------------------------------
// repairTruncatedJson tests
// ---------------------------------------------------------------------------
describe("repairTruncatedJson", () => {
  it("returns null when no overallScore is found", () => {
    const result = repairTruncatedJson("Just some text with no JSON.");
    expect(result).toBeNull();
  });

  it("returns null when dimensions block is empty or missing", () => {
    const text = '{"overallScore": 8.0, "dimensions": {';
    const result = repairTruncatedJson(text);
    expect(result).toBeNull();
  });

  it("extracts all fields from a nearly-complete truncated JSON", () => {
    const text = '```json\n{"overallScore": 7.5, "dimensions": {"partisanBias": 8, "factualAccuracy": 7}, "topStrength": "Good design", "topWeakness": "Needs more`';
    const result = repairTruncatedJson(text);
    expect(result).not.toBeNull();
    expect(result.overallScore).toBe(7.5);
    expect(result.dimensions.partisanBias).toBe(8);
    expect(result.dimensions.factualAccuracy).toBe(7);
    expect(result.topStrength).toBe("Good design");
    // topWeakness is truncated so should not be present
    expect(result.topWeakness).toBeUndefined();
  });

  it("returns parsed object for valid complete JSON", () => {
    const text = '```json\n{"overallScore": 8.0, "dimensions": {"partisanBias": 8}, "topStrength": "OK", "topWeakness": "OK"}\n```';
    const result = repairTruncatedJson(text);
    expect(result).not.toBeNull();
    expect(result.overallScore).toBe(8.0);
  });
});

// ---------------------------------------------------------------------------
// validateScores tests
// ---------------------------------------------------------------------------
describe("validateScores", () => {
  it("returns validated scores for valid input", () => {
    const input = {
      overallScore: 7.5,
      dimensions: { partisanBias: 8, factualAccuracy: 7 },
      topStrength: "Good",
      topWeakness: "Bad",
    };
    const result = validateScores(input);
    expect(result).not.toBeNull();
    expect(result.overallScore).toBe(7.5);
    expect(result.topStrength).toBe("Good");
  });

  it("returns null for missing overallScore", () => {
    expect(validateScores({ dimensions: {} })).toBeNull();
  });

  it("returns null for overallScore out of range", () => {
    expect(validateScores({ overallScore: 0, dimensions: {} })).toBeNull();
    expect(validateScores({ overallScore: 11, dimensions: {} })).toBeNull();
  });

  it("returns null for missing dimensions object", () => {
    expect(validateScores({ overallScore: 7 })).toBeNull();
  });

  it("returns null for non-numeric dimension score", () => {
    expect(validateScores({
      overallScore: 7,
      dimensions: { partisanBias: "high" },
    })).toBeNull();
  });

  it("returns null for dimension score out of range", () => {
    expect(validateScores({
      overallScore: 7,
      dimensions: { partisanBias: 11 },
    })).toBeNull();
  });

  it("sets topStrength and topWeakness to null when missing", () => {
    const result = validateScores({
      overallScore: 7,
      dimensions: { partisanBias: 8 },
    });
    expect(result.topStrength).toBeNull();
    expect(result.topWeakness).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Provider config tests (~6 tests)
// ---------------------------------------------------------------------------
describe("PROVIDERS", () => {
  it("has four providers: chatgpt, gemini, grok, claude", () => {
    expect(Object.keys(PROVIDERS)).toEqual(["chatgpt", "gemini", "grok", "claude"]);
  });

  it("chatgpt builds correct OpenAI request", () => {
    const config = PROVIDERS.chatgpt;
    const env = { OPENAI_API_KEY: "sk-test" };
    const headers = config.buildHeaders(env);
    expect(headers.Authorization).toBe("Bearer sk-test");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = config.buildBody("test prompt");
    expect(body.model).toBe("gpt-4o");
    expect(body.messages[0].content).toBe("test prompt");
    expect(body.max_tokens).toBe(8192);
  });

  it("gemini builds correct Google AI request", () => {
    const config = PROVIDERS.gemini;
    const env = { GEMINI_API_KEY: "gem-test" };
    const endpoint = config.buildEndpoint(env);
    expect(endpoint).toContain("generativelanguage.googleapis.com");
    expect(endpoint).toContain("key=gem-test");

    const headers = config.buildHeaders(env);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBeUndefined();

    const body = config.buildBody("test prompt");
    expect(body.contents[0].parts[0].text).toBe("test prompt");
  });

  it("grok builds correct xAI request", () => {
    const config = PROVIDERS.grok;
    const env = { GROK_API_KEY: "xai-test" };
    const headers = config.buildHeaders(env);
    expect(headers.Authorization).toBe("Bearer xai-test");

    const body = config.buildBody("test prompt");
    expect(body.model).toBe("grok-3");
    expect(body.messages[0].content).toBe("test prompt");
  });

  it("claude builds correct Anthropic request", () => {
    const config = PROVIDERS.claude;
    const env = { ANTHROPIC_API_KEY: "sk-ant-test" };
    const headers = config.buildHeaders(env);
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBeUndefined();

    const body = config.buildBody("test prompt");
    expect(body.model).toBe("claude-sonnet-4-20250514");
    expect(body.messages[0].content).toBe("test prompt");
    expect(body.max_tokens).toBe(4096);
  });

  it("chatgpt extracts text from OpenAI response format", () => {
    const data = { choices: [{ message: { content: "Report text here" } }] };
    expect(PROVIDERS.chatgpt.extractText(data)).toBe("Report text here");
  });

  it("gemini extracts text from Google response format", () => {
    const data = { candidates: [{ content: { parts: [{ text: "Gemini report" }] } }] };
    expect(PROVIDERS.gemini.extractText(data)).toBe("Gemini report");
  });

  it("claude extracts text from Anthropic response format", () => {
    const data = { content: [{ type: "text", text: "Claude report" }] };
    expect(PROVIDERS.claude.extractText(data)).toBe("Claude report");
  });

  it("returns null for empty/malformed responses", () => {
    expect(PROVIDERS.chatgpt.extractText({})).toBeNull();
    expect(PROVIDERS.gemini.extractText({})).toBeNull();
    expect(PROVIDERS.grok.extractText({})).toBeNull();
    expect(PROVIDERS.claude.extractText({})).toBeNull();
  });

  it("extracts usage from OpenAI format", () => {
    const data = { usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } };
    const usage = PROVIDERS.chatgpt.extractUsage(data);
    expect(usage.promptTokens).toBe(100);
    expect(usage.completionTokens).toBe(200);
    expect(usage.totalTokens).toBe(300);
  });

  it("extracts usage from Gemini format", () => {
    const data = { usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 150, totalTokenCount: 200 } };
    const usage = PROVIDERS.gemini.extractUsage(data);
    expect(usage.promptTokens).toBe(50);
    expect(usage.completionTokens).toBe(150);
  });

  it("extracts usage from Anthropic format", () => {
    const data = { usage: { input_tokens: 80, output_tokens: 220 } };
    const usage = PROVIDERS.claude.extractUsage(data);
    expect(usage.promptTokens).toBe(80);
    expect(usage.completionTokens).toBe(220);
    expect(usage.totalTokens).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// Prompt construction tests (~4 tests)
// ---------------------------------------------------------------------------
describe("buildAuditPrompt", () => {
  it("includes the methodology export", () => {
    const exportData = { _meta: { name: "Test" }, guideGeneration: {} };
    const prompt = buildAuditPrompt(exportData);
    expect(prompt).toContain("=== METHODOLOGY EXPORT ===");
    expect(prompt).toContain("=== END EXPORT ===");
    expect(prompt).toContain('"_meta"');
    expect(prompt).toContain('"guideGeneration"');
  });

  it("includes all five audit dimensions", () => {
    const prompt = buildAuditPrompt({ test: true });
    expect(prompt).toContain("DIMENSION 1: Partisan Bias");
    expect(prompt).toContain("DIMENSION 2: Factual Accuracy Safeguards");
    expect(prompt).toContain("DIMENSION 3: Fairness of Framing");
    expect(prompt).toContain("DIMENSION 4: Balance of Pros/Cons");
    expect(prompt).toContain("DIMENSION 5: Transparency of Methodology");
  });

  it("includes structured JSON output instruction", () => {
    const prompt = buildAuditPrompt({ test: true });
    expect(prompt).toContain("OUTPUT FORMAT");
    expect(prompt).toContain("overallScore");
    expect(prompt).toContain("partisanBias");
    expect(prompt).toContain("topStrength");
    expect(prompt).toContain("topWeakness");
  });

  it("includes conciseness instruction", () => {
    const prompt = buildAuditPrompt({ test: true });
    expect(prompt).toContain("concise");
    expect(prompt).toContain("FIRST");
  });

  it("accepts string input directly", () => {
    const prompt = buildAuditPrompt('{"raw": "json string"}');
    expect(prompt).toContain('{"raw": "json string"}');
  });
});

// ---------------------------------------------------------------------------
// callProvider tests (~5 tests)
// ---------------------------------------------------------------------------
describe("callProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns text and usage on successful 200 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: "Audit report" } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await callProvider(PROVIDERS.chatgpt, "test", { OPENAI_API_KEY: "sk-test" });
    expect(result.text).toBe("Audit report");
    expect(result.usage.totalTokens).toBe(30);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it("retries on 429 and returns error after exhausting retries", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 429,
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await callProvider(PROVIDERS.chatgpt, "test", { OPENAI_API_KEY: "sk-test" });
    expect(result.error).toContain("Rate limited");
    expect(result.httpStatus).toBe(429);
    expect(mockFetch).toHaveBeenCalledTimes(3); // 0, 1, 2
  }, 60000);

  it("returns error on 4xx (non-429) without retrying", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await callProvider(PROVIDERS.chatgpt, "test", { OPENAI_API_KEY: "sk-test" });
    expect(result.error).toContain("API error 401");
    expect(result.httpStatus).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns error when extractText returns null", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({}), // No choices/content
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await callProvider(PROVIDERS.chatgpt, "test", { OPENAI_API_KEY: "sk-test" });
    expect(result.error).toContain("No text");
  });

  it("handles network errors with retry", async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockRejectedValueOnce(new Error("Connection refused"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await callProvider(PROVIDERS.chatgpt, "test", { OPENAI_API_KEY: "sk-test" });
    expect(result.error).toContain("Network error");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 30000);
});

// ---------------------------------------------------------------------------
// runAudit orchestrator tests (~5 tests)
// ---------------------------------------------------------------------------
describe("runAudit", () => {
  let mockEnv;
  let kvStore;

  beforeEach(() => {
    vi.restoreAllMocks();
    kvStore = {};
    mockEnv = {
      OPENAI_API_KEY: "sk-test",
      GEMINI_API_KEY: "gem-test",
      GROK_API_KEY: "xai-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
      ADMIN_SECRET: "secret",
      ELECTION_DATA: {
        get: vi.fn((key) => Promise.resolve(kvStore[key] || null)),
        put: vi.fn((key, value) => {
          kvStore[key] = value;
          return Promise.resolve();
        }),
      },
    };
  });

  it("returns error when exportData is missing", async () => {
    const result = await runAudit(mockEnv, {});
    expect(result.error).toBe("exportData is required");
  });

  it("reports missing API key as error", async () => {
    delete mockEnv.OPENAI_API_KEY;
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: '```json\n{"overallScore":8,"dimensions":{"partisanBias":8}}\n```' } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await runAudit(mockEnv, {
      providers: ["chatgpt"],
      exportData: { test: true },
    });
    expect(result.results.chatgpt.status).toBe("error");
    expect(result.results.chatgpt.error).toContain("OPENAI_API_KEY");
  });

  it("skips provider within cooldown period", async () => {
    kvStore["audit:result:chatgpt"] = JSON.stringify({
      timestamp: new Date().toISOString(), // just now
      status: "success",
    });

    const result = await runAudit(mockEnv, {
      providers: ["chatgpt"],
      exportData: { test: true },
    });
    expect(result.results.chatgpt.status).toBe("skipped");
    expect(result.results.chatgpt.reason).toBe("cooldown");
  });

  it("force flag bypasses cooldown", async () => {
    kvStore["audit:result:chatgpt"] = JSON.stringify({
      timestamp: new Date().toISOString(),
      status: "success",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: '```json\n{"overallScore":8,"dimensions":{"partisanBias":8,"factualAccuracy":7,"fairnessOfFraming":8,"balanceOfProsCons":7,"transparency":9},"topStrength":"Good","topWeakness":"Bad"}\n```' } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await runAudit(mockEnv, {
      providers: ["chatgpt"],
      force: true,
      exportData: { test: true },
    });
    expect(result.results.chatgpt.status).toBe("success");
    expect(mockFetch).toHaveBeenCalled();
  });

  it("stores results in KV with correct keys", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: '```json\n{"overallScore":7.5,"dimensions":{"partisanBias":8,"factualAccuracy":7,"fairnessOfFraming":8,"balanceOfProsCons":7,"transparency":9},"topStrength":"Good","topWeakness":"Bad"}\n```' } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await runAudit(mockEnv, {
      providers: ["chatgpt"],
      force: true,
      exportData: { test: true },
    });

    // Check KV writes
    const putCalls = mockEnv.ELECTION_DATA.put.mock.calls;
    const keys = putCalls.map((c) => c[0]);
    expect(keys).toContain("audit:result:chatgpt");
    expect(keys).toContain("audit:summary");
    expect(keys.some((k) => k.startsWith("audit:log:"))).toBe(true);

    // Verify result content
    const storedResult = JSON.parse(kvStore["audit:result:chatgpt"]);
    expect(storedResult.status).toBe("success");
    expect(storedResult.scores.overallScore).toBe(7.5);
    expect(storedResult.provider).toBe("chatgpt");

    // Verify summary
    const storedSummary = JSON.parse(kvStore["audit:summary"]);
    expect(storedSummary.providers.chatgpt.overallScore).toBe(7.5);
    expect(storedSummary.providers.chatgpt.status).toBe("success");
  });

  it("merges with existing summary (preserves other providers)", async () => {
    kvStore["audit:summary"] = JSON.stringify({
      providers: {
        gemini: { status: "success", overallScore: 8.6, displayName: "Gemini (Google)" },
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: '```json\n{"overallScore":7,"dimensions":{"partisanBias":7},"topStrength":"OK","topWeakness":"OK"}\n```' } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await runAudit(mockEnv, {
      providers: ["chatgpt"],
      force: true,
      exportData: { test: true },
    });

    const storedSummary = JSON.parse(kvStore["audit:summary"]);
    expect(storedSummary.providers.chatgpt.overallScore).toBe(7);
    expect(storedSummary.providers.gemini.overallScore).toBe(8.6); // Preserved
  });

  it("runs audit with claude provider successfully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        content: [{ type: "text", text: '```json\n{"overallScore":8.5,"dimensions":{"partisanBias":9,"factualAccuracy":8,"fairnessOfFraming":8,"balanceOfProsCons":8,"transparency":9},"topStrength":"Excellent transparency","topWeakness":"Could add more citations"}\n```' }],
        usage: { input_tokens: 100, output_tokens: 500 },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await runAudit(mockEnv, {
      providers: ["claude"],
      force: true,
      exportData: { test: true },
    });
    expect(result.results.claude.status).toBe("success");
    expect(result.results.claude.scores.overallScore).toBe(8.5);
    expect(result.results.claude.provider).toBe("claude");
    expect(result.results.claude.displayName).toBe("Claude (Anthropic)");
    expect(result.results.claude.model).toBe("claude-sonnet-4-20250514");
    expect(result.results.claude.usage.promptTokens).toBe(100);
    expect(result.results.claude.usage.completionTokens).toBe(500);

    // Verify correct headers were sent
    const fetchCall = mockFetch.mock.calls[0];
    const fetchOptions = fetchCall[1];
    const headers = fetchOptions.headers;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers.Authorization).toBeUndefined();

    // Verify KV storage
    const storedResult = JSON.parse(kvStore["audit:result:claude"]);
    expect(storedResult.status).toBe("success");
    expect(storedResult.scores.overallScore).toBe(8.5);
  });

  it("reports missing ANTHROPIC_API_KEY for claude", async () => {
    delete mockEnv.ANTHROPIC_API_KEY;
    const result = await runAudit(mockEnv, {
      providers: ["claude"],
      exportData: { test: true },
    });
    expect(result.results.claude.status).toBe("error");
    expect(result.results.claude.error).toContain("ANTHROPIC_API_KEY");
  });

  it("handles unknown provider name gracefully", async () => {
    const result = await runAudit(mockEnv, {
      providers: ["notreal"],
      exportData: { test: true },
    });
    expect(result.results.notreal.status).toBe("error");
    expect(result.results.notreal.error).toContain("Unknown provider");
  });
});

// ---------------------------------------------------------------------------
// DIMENSION_KEYS constant
// ---------------------------------------------------------------------------
describe("DIMENSION_KEYS", () => {
  it("has exactly 5 dimension keys", () => {
    expect(DIMENSION_KEYS).toHaveLength(5);
    expect(DIMENSION_KEYS).toContain("partisanBias");
    expect(DIMENSION_KEYS).toContain("factualAccuracy");
    expect(DIMENSION_KEYS).toContain("fairnessOfFraming");
    expect(DIMENSION_KEYS).toContain("balanceOfProsCons");
    expect(DIMENSION_KEYS).toContain("transparency");
  });
});

// ---------------------------------------------------------------------------
// buildSynthesisPrompt tests
// ---------------------------------------------------------------------------
describe("buildSynthesisPrompt", () => {
  const mockResults = [
    ["chatgpt", {
      displayName: "ChatGPT (OpenAI)",
      model: "gpt-4o",
      scores: {
        overallScore: 7.5,
        dimensions: { partisanBias: 8, factualAccuracy: 7, fairnessOfFraming: 8, balanceOfProsCons: 7, transparency: 9 },
        topStrength: "Great transparency",
        topWeakness: "Missing citations",
      },
      responseText: "Full report text from ChatGPT...",
    }],
    ["gemini", {
      displayName: "Gemini (Google)",
      model: "gemini-2.5-flash",
      scores: {
        overallScore: 8.6,
        dimensions: { partisanBias: 9, factualAccuracy: 8, fairnessOfFraming: 8, balanceOfProsCons: 8, transparency: 10 },
        topStrength: "Excellent design",
        topWeakness: "Needs more sources",
      },
      responseText: "Full report text from Gemini...",
    }],
  ];

  it("includes provider names and models in the prompt", () => {
    const prompt = buildSynthesisPrompt(mockResults);
    expect(prompt).toContain("ChatGPT (OpenAI)");
    expect(prompt).toContain("gpt-4o");
    expect(prompt).toContain("Gemini (Google)");
    expect(prompt).toContain("gemini-2.5-flash");
  });

  it("includes overall scores from each provider", () => {
    const prompt = buildSynthesisPrompt(mockResults);
    expect(prompt).toContain("Overall: 7.5/10");
    expect(prompt).toContain("Overall: 8.6/10");
  });

  it("includes dimension scores from each provider", () => {
    const prompt = buildSynthesisPrompt(mockResults);
    expect(prompt).toContain("Partisan Bias 8");
    expect(prompt).toContain("Partisan Bias 9");
    expect(prompt).toContain("Transparency 9");
    expect(prompt).toContain("Transparency 10");
  });

  it("includes top strengths and weaknesses", () => {
    const prompt = buildSynthesisPrompt(mockResults);
    expect(prompt).toContain("Great transparency");
    expect(prompt).toContain("Missing citations");
    expect(prompt).toContain("Excellent design");
    expect(prompt).toContain("Needs more sources");
  });

  it("includes response text (abbreviated to 3000 chars)", () => {
    const prompt = buildSynthesisPrompt(mockResults);
    expect(prompt).toContain("Full report text from ChatGPT...");
    expect(prompt).toContain("Full report text from Gemini...");
  });

  it("truncates long response text at 3000 characters", () => {
    const longResults = [
      ["chatgpt", {
        displayName: "ChatGPT (OpenAI)",
        model: "gpt-4o",
        scores: {
          overallScore: 7,
          dimensions: { partisanBias: 7 },
          topStrength: "OK",
          topWeakness: "OK",
        },
        responseText: "A".repeat(5000),
      }],
      ["gemini", {
        displayName: "Gemini (Google)",
        model: "gemini-2.5-flash",
        scores: {
          overallScore: 8,
          dimensions: { partisanBias: 8 },
          topStrength: "OK",
          topWeakness: "OK",
        },
        responseText: "Short text",
      }],
    ];
    const prompt = buildSynthesisPrompt(longResults);
    // The long text should be truncated, so the full 5000 A's should not appear
    expect(prompt).not.toContain("A".repeat(5000));
    // But the first 3000 should appear
    expect(prompt).toContain("A".repeat(3000));
  });

  it("includes synthesis instructions requesting 5 sections", () => {
    const prompt = buildSynthesisPrompt(mockResults);
    expect(prompt).toContain("Average Scores");
    expect(prompt).toContain("Consensus Findings");
    expect(prompt).toContain("Divergent Opinions");
    expect(prompt).toContain("Top 5 Actionable Recommendations");
    expect(prompt).toContain("Credibility Assessment");
  });

  it("mentions the correct provider count", () => {
    const prompt = buildSynthesisPrompt(mockResults);
    expect(prompt).toContain("2 independent AI systems");
  });

  it("handles N/A for missing topStrength and topWeakness", () => {
    const resultsWithMissing = [
      ["chatgpt", {
        displayName: "ChatGPT",
        model: "gpt-4o",
        scores: {
          overallScore: 7,
          dimensions: { partisanBias: 7 },
          topStrength: null,
          topWeakness: null,
        },
        responseText: "Report",
      }],
      ["gemini", {
        displayName: "Gemini",
        model: "gemini-2.5-flash",
        scores: {
          overallScore: 8,
          dimensions: { partisanBias: 8 },
          topStrength: "Good",
          topWeakness: undefined,
        },
        responseText: "Report",
      }],
    ];
    const prompt = buildSynthesisPrompt(resultsWithMissing);
    expect(prompt).toContain("N/A");
  });

  it("handles missing responseText gracefully", () => {
    const resultsNoText = [
      ["chatgpt", {
        displayName: "ChatGPT",
        model: "gpt-4o",
        scores: { overallScore: 7, dimensions: { partisanBias: 7 } },
        responseText: undefined,
      }],
      ["gemini", {
        displayName: "Gemini",
        model: "gemini-2.5-flash",
        scores: { overallScore: 8, dimensions: { partisanBias: 8 } },
        responseText: null,
      }],
    ];
    // Should not throw
    const prompt = buildSynthesisPrompt(resultsNoText);
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Provider extractUsage edge cases
// ---------------------------------------------------------------------------
describe("Provider extractUsage edge cases", () => {
  it("chatgpt returns null when usage is missing", () => {
    expect(PROVIDERS.chatgpt.extractUsage({})).toBeNull();
  });

  it("gemini returns null when usageMetadata is missing", () => {
    expect(PROVIDERS.gemini.extractUsage({})).toBeNull();
  });

  it("grok returns null when usage is missing", () => {
    expect(PROVIDERS.grok.extractUsage({})).toBeNull();
  });

  it("claude returns null when usage is missing", () => {
    expect(PROVIDERS.claude.extractUsage({})).toBeNull();
  });

  it("grok extracts usage from OpenAI-compatible format", () => {
    const data = { usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 } };
    const usage = PROVIDERS.grok.extractUsage(data);
    expect(usage.promptTokens).toBe(50);
    expect(usage.completionTokens).toBe(100);
    expect(usage.totalTokens).toBe(150);
  });

  it("claude handles zero token counts", () => {
    const data = { usage: { input_tokens: 0, output_tokens: 0 } };
    const usage = PROVIDERS.claude.extractUsage(data);
    expect(usage.totalTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runAudit — synthesis generation
// ---------------------------------------------------------------------------
describe("runAudit — synthesis generation", () => {
  let mockEnv;
  let kvStore;

  beforeEach(() => {
    vi.restoreAllMocks();
    kvStore = {};
    mockEnv = {
      OPENAI_API_KEY: "sk-test",
      GEMINI_API_KEY: "gem-test",
      GROK_API_KEY: "xai-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
      ADMIN_SECRET: "secret",
      ELECTION_DATA: {
        get: vi.fn((key) => Promise.resolve(kvStore[key] || null)),
        put: vi.fn((key, value) => {
          kvStore[key] = value;
          return Promise.resolve();
        }),
      },
    };
  });

  it("generates synthesis report when 2+ providers succeed", async () => {
    // Mock both chatgpt and gemini to succeed, then claude for synthesis
    let fetchCallCount = 0;
    const mockFetch = vi.fn(() => {
      fetchCallCount++;
      if (fetchCallCount <= 2) {
        // Provider audit calls (chatgpt and gemini)
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({
            choices: [{ message: { content: '```json\n{"overallScore":8,"dimensions":{"partisanBias":8,"factualAccuracy":7,"fairnessOfFraming":8,"balanceOfProsCons":7,"transparency":9},"topStrength":"Good","topWeakness":"Bad"}\n```' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
        });
      }
      // Synthesis call via Anthropic
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ type: "text", text: "# Synthesis Report\n\nAll providers agree..." }],
        }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await runAudit(mockEnv, {
      providers: ["chatgpt", "grok"],
      force: true,
      exportData: { test: true },
    });

    expect(result.success).toBe(true);
    // With 2 successful results and ANTHROPIC_API_KEY present, synthesis should be attempted
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 30000);

  it("skips synthesis when fewer than 2 providers succeed", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: '```json\n{"overallScore":8,"dimensions":{"partisanBias":8},"topStrength":"Good","topWeakness":"Bad"}\n```' } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await runAudit(mockEnv, {
      providers: ["chatgpt"],
      force: true,
      exportData: { test: true },
    });

    expect(result.success).toBe(true);
    // Only 1 provider, so synthesis call should not happen
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("computes average score across successful providers", async () => {
    let callIdx = 0;
    const mockFetch = vi.fn(() => {
      callIdx++;
      const score = callIdx === 1 ? 7 : 9;
      return Promise.resolve({
        status: 200,
        json: () => Promise.resolve({
          choices: [{ message: { content: `\`\`\`json\n{"overallScore":${score},"dimensions":{"partisanBias":${score}},"topStrength":"OK","topWeakness":"OK"}\n\`\`\`` } }],
        }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await runAudit(mockEnv, {
      providers: ["chatgpt", "grok"],
      force: true,
      exportData: { test: true },
    });

    const summary = JSON.parse(kvStore["audit:summary"]);
    expect(summary.averageScore).toBe(8.0);
  }, 30000);

  it("writes daily log with correct date key", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: '```json\n{"overallScore":7,"dimensions":{"partisanBias":7},"topStrength":"OK","topWeakness":"OK"}\n```' } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await runAudit(mockEnv, {
      providers: ["chatgpt"],
      force: true,
      exportData: { test: true },
    });

    const putCalls = mockEnv.ELECTION_DATA.put.mock.calls.map((c) => c[0]);
    const logKey = putCalls.find((k) => k.startsWith("audit:log:"));
    expect(logKey).toBeDefined();
    expect(logKey).toMatch(/^audit:log:\d{4}-\d{2}-\d{2}$/);
  });

  it("stores parse_failed status when score parsing fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: "I cannot provide a structured audit at this time." } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await runAudit(mockEnv, {
      providers: ["chatgpt"],
      force: true,
      exportData: { test: true },
    });

    expect(result.results.chatgpt.status).toBe("parse_failed");
    expect(result.results.chatgpt.parseError).toBeTruthy();
    expect(result.results.chatgpt.scores).toBeNull();
  });
});
