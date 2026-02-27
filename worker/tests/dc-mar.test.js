import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseMARLabel, parseMARResponse, buildMARCacheKey, resolveDCAddress } from "../src/dc-mar.js";
import worker from "../src/index.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleBallot = readFileSync(
  join(__dirname, "fixtures/sample-ballot.json"),
  "utf-8"
);

// ===========================================================================
// MAR label parsing
// ===========================================================================
describe("parseMARLabel", () => {
  it("parses 'Ward 2' -> '2'", () => {
    expect(parseMARLabel("Ward 2", "Ward")).toBe("2");
  });

  it("parses 'ANC 2A' -> '2A'", () => {
    expect(parseMARLabel("ANC 2A", "ANC")).toBe("2A");
  });

  it("parses 'SMD 2A07' -> '2A07'", () => {
    expect(parseMARLabel("SMD 2A07", "SMD")).toBe("2A07");
  });

  it("parses 'Precinct 2' -> '2'", () => {
    expect(parseMARLabel("Precinct 2", "Precinct")).toBe("2");
  });

  it("parses 'Ward 8' -> '8'", () => {
    expect(parseMARLabel("Ward 8", "Ward")).toBe("8");
  });

  it("parses 'ANC 7E' -> '7E'", () => {
    expect(parseMARLabel("ANC 7E", "ANC")).toBe("7E");
  });

  it("parses 'Precinct 137' -> '137'", () => {
    expect(parseMARLabel("Precinct 137", "Precinct")).toBe("137");
  });

  it("returns null for null input", () => {
    expect(parseMARLabel(null, "Ward")).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseMARLabel(undefined, "Ward")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseMARLabel("", "Ward")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(parseMARLabel(42, "Ward")).toBeNull();
  });

  it("returns null for mismatched prefix", () => {
    expect(parseMARLabel("ANC 2A", "Ward")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(parseMARLabel("WARD 2", "Ward")).toBe("2");
    expect(parseMARLabel("ward 2", "Ward")).toBe("2");
  });

  it("handles extra whitespace in value", () => {
    expect(parseMARLabel("Ward  2 ", "Ward")).toBe("2");
  });
});

// ===========================================================================
// MAR response parsing
// ===========================================================================
describe("parseMARResponse", () => {
  const fullResponse = {
    returnDataset: {
      Table1: [
        {
          FULLADDRESS: "1600 PENNSYLVANIA AVENUE NW",
          WARD: "Ward 2",
          ANC: "ANC 2A",
          SMD: "SMD 2A07",
          VOTE_PRCNCT: "Precinct 2",
          LATITUDE: 38.89766766,
          LONGITUDE: -77.03654468,
          ZIPCODE: "20500",
          ConfidenceLevel: 100.0,
          STATUS: "ACTIVE",
        },
      ],
    },
  };

  it("parses a full MAR response correctly", () => {
    const result = parseMARResponse(fullResponse);
    expect(result).toEqual({
      ward: "2",
      anc: "2A",
      smd: "2A07",
      votingPrecinct: "2",
      latitude: 38.89766766,
      longitude: -77.03654468,
      confidence: 100,
      fullAddress: "1600 PENNSYLVANIA AVENUE NW",
    });
  });

  it("returns null when returnDataset is null", () => {
    expect(parseMARResponse({ returnDataset: null })).toBeNull();
  });

  it("returns null when data is null", () => {
    expect(parseMARResponse(null)).toBeNull();
  });

  it("returns null when data is undefined", () => {
    expect(parseMARResponse(undefined)).toBeNull();
  });

  it("returns null when Table1 is empty array", () => {
    expect(parseMARResponse({ returnDataset: { Table1: [] } })).toBeNull();
  });

  it("returns null when Table1 is missing", () => {
    expect(parseMARResponse({ returnDataset: {} })).toBeNull();
  });

  it("returns null when STATUS is not ACTIVE", () => {
    const response = {
      returnDataset: {
        Table1: [
          {
            ...fullResponse.returnDataset.Table1[0],
            STATUS: "RETIRED",
          },
        ],
      },
    };
    expect(parseMARResponse(response)).toBeNull();
  });

  it("handles missing fields gracefully", () => {
    const response = {
      returnDataset: {
        Table1: [
          {
            FULLADDRESS: "123 MAIN ST",
            WARD: "Ward 5",
            STATUS: "ACTIVE",
            // Missing ANC, SMD, VOTE_PRCNCT, LATITUDE, LONGITUDE, ConfidenceLevel
          },
        ],
      },
    };
    const result = parseMARResponse(response);
    expect(result).toEqual({
      ward: "5",
      anc: null,
      smd: null,
      votingPrecinct: null,
      latitude: null,
      longitude: null,
      confidence: null,
      fullAddress: "123 MAIN ST",
    });
  });

  it("handles low confidence results (still parses)", () => {
    const response = {
      returnDataset: {
        Table1: [
          {
            ...fullResponse.returnDataset.Table1[0],
            ConfidenceLevel: 45.5,
          },
        ],
      },
    };
    const result = parseMARResponse(response);
    expect(result.confidence).toBe(45.5);
  });

  it("uses first row when multiple matches returned", () => {
    const response = {
      returnDataset: {
        Table1: [
          {
            FULLADDRESS: "100 MAIN ST NW",
            WARD: "Ward 1",
            ANC: "ANC 1A",
            SMD: "SMD 1A01",
            VOTE_PRCNCT: "Precinct 1",
            LATITUDE: 38.9,
            LONGITUDE: -77.0,
            ConfidenceLevel: 95.0,
            STATUS: "ACTIVE",
          },
          {
            FULLADDRESS: "100 MAIN ST NE",
            WARD: "Ward 5",
            ANC: "ANC 5A",
            SMD: "SMD 5A01",
            VOTE_PRCNCT: "Precinct 50",
            LATITUDE: 38.91,
            LONGITUDE: -76.99,
            ConfidenceLevel: 80.0,
            STATUS: "ACTIVE",
          },
        ],
      },
    };
    const result = parseMARResponse(response);
    expect(result.ward).toBe("1");
    expect(result.anc).toBe("1A");
  });

  it("allows no STATUS field (treated as active)", () => {
    const response = {
      returnDataset: {
        Table1: [
          {
            FULLADDRESS: "200 E ST NW",
            WARD: "Ward 6",
            ANC: "ANC 6D",
            SMD: "SMD 6D07",
            VOTE_PRCNCT: "Precinct 115",
            LATITUDE: 38.89,
            LONGITUDE: -77.01,
            ConfidenceLevel: 100.0,
            // No STATUS field
          },
        ],
      },
    };
    const result = parseMARResponse(response);
    expect(result).not.toBeNull();
    expect(result.ward).toBe("6");
  });
});

// ===========================================================================
// MAR cache key building
// ===========================================================================
describe("buildMARCacheKey", () => {
  it("returns a string starting with 'dc:mar:'", () => {
    const key = buildMARCacheKey("1600 Penn Ave NW", "Washington", "DC", "20500");
    expect(key).toMatch(/^dc:mar:/);
  });

  it("produces deterministic keys", () => {
    const k1 = buildMARCacheKey("1600 Penn Ave NW", "Washington", "DC", "20500");
    const k2 = buildMARCacheKey("1600 Penn Ave NW", "Washington", "DC", "20500");
    expect(k1).toBe(k2);
  });

  it("produces different keys for different addresses", () => {
    const k1 = buildMARCacheKey("1600 Penn Ave NW", "Washington", "DC", "20500");
    const k2 = buildMARCacheKey("200 E St NW", "Washington", "DC", "20001");
    expect(k1).not.toBe(k2);
  });

  it("normalizes case", () => {
    const k1 = buildMARCacheKey("1600 penn ave nw", "washington", "dc", "20500");
    const k2 = buildMARCacheKey("1600 PENN AVE NW", "WASHINGTON", "DC", "20500");
    expect(k1).toBe(k2);
  });

  it("handles null/undefined fields", () => {
    const k1 = buildMARCacheKey("123 Main St", null, undefined, "");
    expect(k1).toMatch(/^dc:mar:/);
  });
});

// ===========================================================================
// resolveDCAddress — integration with mocked fetch
// ===========================================================================
describe("resolveDCAddress", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const marSuccessResponse = {
    returnDataset: {
      Table1: [
        {
          FULLADDRESS: "1600 PENNSYLVANIA AVENUE NW",
          WARD: "Ward 2",
          ANC: "ANC 2A",
          SMD: "SMD 2A07",
          VOTE_PRCNCT: "Precinct 2",
          LATITUDE: 38.89766766,
          LONGITUDE: -77.03654468,
          ZIPCODE: "20500",
          ConfidenceLevel: 100.0,
          STATUS: "ACTIVE",
        },
      ],
    },
  };

  it("returns districts on successful MAR lookup", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(marSuccessResponse))
    );

    const result = await resolveDCAddress("1600 Pennsylvania Avenue NW", {
      zip: "20500",
    });
    expect(result.districts).toBeDefined();
    expect(result.districts.ward).toBe("2");
    expect(result.districts.anc).toBe("2A");
    expect(result.districts.smd).toBe("2A07");
    expect(result.districts.votingPrecinct).toBe("2");
    expect(result.districts.latitude).toBe(38.89766766);
    expect(result.districts.longitude).toBe(-77.03654468);
    expect(result.districts.confidence).toBe(100);
    expect(result.cached).toBe(false);
  });

  it("returns error when MAR returns no match", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ returnDataset: null }))
    );

    const result = await resolveDCAddress("99999 Nonexistent St");
    expect(result.error).toBe("address_not_found");
  });

  it("returns error on MAR API failure", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("Service Unavailable", { status: 503 })
    );

    const result = await resolveDCAddress("1600 Pennsylvania Avenue NW");
    expect(result.error).toBe("mar_unavailable");
  });

  it("returns error on MAR timeout", async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      // Simulate abort
      if (opts?.signal) {
        return new Promise((_, reject) => {
          opts.signal.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
    });

    const result = await resolveDCAddress("1600 Pennsylvania Avenue NW", {
      timeoutMs: 10, // Very short timeout to trigger abort
    });
    expect(result.error).toBe("mar_timeout");
  });

  it("returns error on invalid JSON response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("not json at all", { status: 200 })
    );

    const result = await resolveDCAddress("1600 Pennsylvania Avenue NW");
    expect(result.error).toBe("mar_invalid_response");
  });

  it("returns error when fetch throws (network error)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Network error");
    });

    const result = await resolveDCAddress("1600 Pennsylvania Avenue NW");
    expect(result.error).toBe("mar_unavailable");
  });

  it("uses KV cache when available", async () => {
    const cachedDistricts = {
      ward: "2",
      anc: "2A",
      smd: "2A07",
      votingPrecinct: "2",
      latitude: 38.897,
      longitude: -77.036,
      confidence: 100,
      fullAddress: "1600 PENNSYLVANIA AVENUE NW",
    };

    const mockKV = {
      get: vi.fn(async () => cachedDistricts),
      put: vi.fn(async () => {}),
    };

    // fetch should NOT be called if cache hits
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Should not be called");
    });

    const result = await resolveDCAddress("1600 Pennsylvania Avenue NW", {
      kv: mockKV,
    });
    expect(result.districts).toEqual(cachedDistricts);
    expect(result.cached).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("writes to KV cache on successful lookup", async () => {
    const mockKV = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
    };

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(marSuccessResponse))
    );

    const result = await resolveDCAddress("1600 Pennsylvania Avenue NW", {
      kv: mockKV,
    });
    expect(result.districts).toBeDefined();
    expect(mockKV.put).toHaveBeenCalledTimes(1);
    const putArgs = mockKV.put.mock.calls[0];
    expect(putArgs[0]).toMatch(/^dc:mar:/);
    const putData = JSON.parse(putArgs[1]);
    expect(putData.ward).toBe("2");
    expect(putArgs[2]).toEqual({ expirationTtl: 7 * 24 * 60 * 60 });
  });

  it("does not write to KV cache on failed lookup", async () => {
    const mockKV = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
    };

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ returnDataset: null }))
    );

    const result = await resolveDCAddress("99999 Nonexistent", { kv: mockKV });
    expect(result.error).toBe("address_not_found");
    expect(mockKV.put).not.toHaveBeenCalled();
  });

  it("calls MAR API with correct URL encoding", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(marSuccessResponse))
    );

    await resolveDCAddress("1600 Pennsylvania Avenue NW", {
      city: "Washington",
      state: "DC",
      zip: "20500",
    });

    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("citizenatlas.dc.gov");
    expect(calledUrl).toContain("f=json");
    expect(calledUrl).toContain("str=");
    // Should contain URL-encoded address parts
    expect(calledUrl).toContain(encodeURIComponent("1600 Pennsylvania Avenue NW, Washington, DC, 20500"));
  });

  it("handles KV cache error gracefully", async () => {
    const mockKV = {
      get: vi.fn(async () => { throw new Error("KV read error"); }),
      put: vi.fn(async () => { throw new Error("KV write error"); }),
    };

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(marSuccessResponse))
    );

    // Should succeed despite KV errors
    const result = await resolveDCAddress("1600 Pennsylvania Avenue NW", {
      kv: mockKV,
    });
    expect(result.districts).toBeDefined();
    expect(result.districts.ward).toBe("2");
  });
});

// ===========================================================================
// /dc/app/api/districts endpoint — integration tests
// ===========================================================================
function mockKVStore(initial = {}) {
  const store = { ...initial };
  return {
    _store: store,
    get: vi.fn(async (key, type) => {
      const val = store[key] !== undefined ? store[key] : null;
      if (type === "json" && val) {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    }),
    put: vi.fn(async (key, value, opts) => {
      store[key] = value;
    }),
    delete: vi.fn(async (key) => {
      delete store[key];
    }),
    list: vi.fn(async ({ prefix } = {}) => {
      const keys = Object.keys(store)
        .filter((k) => !prefix || k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    }),
  };
}

function createMockEnv(kvOverrides = {}) {
  return {
    ELECTION_DATA: mockKVStore({
      "ballot:statewide:democrat_primary_2026": sampleBallot,
      "ballot:statewide:republican_primary_2026": sampleBallot,
      manifest: JSON.stringify({
        republican: { updatedAt: new Date().toISOString(), version: "1" },
        democrat: { updatedAt: new Date().toISOString(), version: "1" },
      }),
      "audit:summary": JSON.stringify({ providers: {}, averageScore: null }),
      ...kvOverrides,
    }),
    ADMIN_SECRET: "test-secret-123",
    ANTHROPIC_API_KEY: "sk-test",
  };
}

async function post(path, body, env, headers = {}) {
  const url = `https://txvotes.app${path}`;
  const request = new Request(url, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": headers["CF-Connecting-IP"] || "1.2.3.4",
      ...headers,
    },
  });
  return worker.fetch(request, env || createMockEnv());
}

describe("POST /dc/app/api/districts", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const marSuccessResponse = {
    returnDataset: {
      Table1: [
        {
          FULLADDRESS: "1600 PENNSYLVANIA AVENUE NW",
          WARD: "Ward 2",
          ANC: "ANC 2A",
          SMD: "SMD 2A07",
          VOTE_PRCNCT: "Precinct 2",
          LATITUDE: 38.89766766,
          LONGITUDE: -77.03654468,
          ZIPCODE: "20500",
          ConfidenceLevel: 100.0,
          STATUS: "ACTIVE",
        },
      ],
    },
  };

  const censusSuccessResponse = {
    result: {
      addressMatches: [
        {
          matchedAddress: "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500",
          coordinates: { x: -77.036, y: 38.897 },
          geographies: {
            "Congressional Districts 118th": [{ BASENAME: "98" }],
          },
        },
      ],
    },
  };

  it("returns 400 when street is missing", async () => {
    const res = await post("/dc/app/api/districts", { city: "Washington" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing street");
  });

  it("returns 400 when body is not valid JSON", async () => {
    const url = "https://txvotes.app/dc/app/api/districts";
    const request = new Request(url, {
      method: "POST",
      body: "not json",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "1.2.3.4",
      },
    });
    const env = createMockEnv();
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns district data from MAR API", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(marSuccessResponse))
    );

    const res = await post("/dc/app/api/districts", {
      street: "1600 Pennsylvania Avenue NW",
      city: "Washington",
      state: "DC",
      zip: "20500",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ward).toBe("Ward 2");
    expect(body.anc).toBe("ANC 2A");
    expect(body.smd).toBe("SMD 2A07");
    expect(body.votingPrecinct).toBe("Precinct 2");
    expect(body.congressional).toBe("At-Large");
    expect(body.latitude).toBe(38.89766766);
    expect(body.longitude).toBe(-77.03654468);
    expect(body.confidence).toBe(100);
    expect(body.source).toBe("dc_mar");
    expect(body.fullAddress).toBe("1600 PENNSYLVANIA AVENUE NW");
  });

  it("defaults city to Washington and state to DC", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(marSuccessResponse))
    );

    const res = await post("/dc/app/api/districts", {
      street: "1600 Pennsylvania Avenue NW",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ward).toBe("Ward 2");
    expect(body.source).toBe("dc_mar");
  });

  it("falls back to Census geocoder when MAR fails", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async (url) => {
      callCount++;
      if (url.includes("citizenatlas.dc.gov")) {
        // MAR fails
        return new Response("Service Unavailable", { status: 503 });
      }
      if (url.includes("geocoding.geo.census.gov")) {
        // Census succeeds
        return new Response(JSON.stringify(censusSuccessResponse));
      }
      return new Response("Not found", { status: 404 });
    });

    const res = await post("/dc/app/api/districts", {
      street: "1600 Pennsylvania Avenue NW",
      zip: "20500",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("census_fallback");
    expect(body.congressional).toBe("At-Large");
    expect(body.latitude).toBe(38.897);
    expect(body.longitude).toBe(-77.036);
    // Ward/ANC/SMD not available from Census
    expect(body.ward).toBeNull();
    expect(body.anc).toBeNull();
    expect(body.smd).toBeNull();
  });

  it("returns 404 when both MAR and Census find no match", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes("citizenatlas.dc.gov")) {
        return new Response(JSON.stringify({ returnDataset: null }));
      }
      if (url.includes("geocoding.geo.census.gov")) {
        return new Response(JSON.stringify({ result: { addressMatches: [] } }));
      }
      return new Response("Not found", { status: 404 });
    });

    const res = await post("/dc/app/api/districts", {
      street: "99999 Nowhere St",
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("address_not_found");
  });

  it("returns 502 when both MAR and Census are unavailable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Network error");
    });

    const res = await post("/dc/app/api/districts", {
      street: "1600 Pennsylvania Avenue NW",
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("has CORS headers in response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(marSuccessResponse))
    );

    const res = await post("/dc/app/api/districts", {
      street: "1600 Pennsylvania Avenue NW",
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns cached:true when result comes from KV cache", async () => {
    const cachedDistricts = {
      ward: "2",
      anc: "2A",
      smd: "2A07",
      votingPrecinct: "2",
      latitude: 38.897,
      longitude: -77.036,
      confidence: 100,
      fullAddress: "1600 PENNSYLVANIA AVENUE NW",
    };

    // Pre-populate the KV cache
    const cacheKey = buildMARCacheKey(
      "1600 Pennsylvania Avenue NW",
      "Washington",
      "DC",
      "20500"
    );
    const env = createMockEnv({
      [cacheKey]: JSON.stringify(cachedDistricts),
    });

    // fetch should not be called
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Should not be called");
    });

    const res = await post(
      "/dc/app/api/districts",
      {
        street: "1600 Pennsylvania Avenue NW",
        city: "Washington",
        state: "DC",
        zip: "20500",
      },
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(body.source).toBe("dc_mar");
    expect(body.ward).toBe("Ward 2");
  });

  it("OPTIONS /dc/app/api/districts returns CORS preflight", async () => {
    const url = "https://txvotes.app/dc/app/api/districts";
    const request = new Request(url, { method: "OPTIONS" });
    const env = createMockEnv();
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});
