// DC MAR (Master Address Repository) API integration
// Maps DC addresses to Ward, ANC, SMD, and Voting Precinct

const MAR_BASE_URL = "https://citizenatlas.dc.gov/newwebservices/locationverifier.asmx/findLocation2";
const MAR_TIMEOUT_MS = 5000;
const MAR_CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Parse a MAR label like "Ward 2" into just "2",
 * "ANC 2A" into "2A", "SMD 2A07" into "2A07",
 * "Precinct 2" into "2".
 * Returns null if input is falsy or doesn't match.
 */
export function parseMARLabel(label, prefix) {
  if (!label || typeof label !== "string") return null;
  const re = new RegExp(`^${prefix}\\s+(.+)$`, "i");
  const m = label.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Parse a MAR API response into a structured district object.
 * Returns null if no valid match found.
 */
export function parseMARResponse(data) {
  if (!data || !data.returnDataset || !data.returnDataset.Table1) {
    return null;
  }

  const rows = data.returnDataset.Table1;
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  // Use the first (best) match
  const row = rows[0];

  // Require ACTIVE status
  if (row.STATUS && row.STATUS !== "ACTIVE") {
    return null;
  }

  const ward = parseMARLabel(row.WARD, "Ward");
  const anc = parseMARLabel(row.ANC, "ANC");
  const smd = parseMARLabel(row.SMD, "SMD");
  const votingPrecinct = parseMARLabel(row.VOTE_PRCNCT, "Precinct");

  return {
    ward,
    anc,
    smd,
    votingPrecinct,
    latitude: row.LATITUDE != null ? Number(row.LATITUDE) : null,
    longitude: row.LONGITUDE != null ? Number(row.LONGITUDE) : null,
    confidence: row.ConfidenceLevel != null ? Number(row.ConfidenceLevel) : null,
    fullAddress: row.FULLADDRESS || null,
  };
}

/**
 * Build a cache key for a MAR address lookup.
 * Uses a simple hash of the normalized address string.
 */
export function buildMARCacheKey(street, city, state, zip) {
  const normalized = [street, city, state, zip]
    .map(s => (s || "").trim().toUpperCase())
    .join("|");
  // Simple string hash (FNV-1a style) — deterministic, no crypto needed
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `dc:mar:${(hash >>> 0).toString(36)}`;
}

/**
 * Resolve a DC address to districts using the MAR API.
 *
 * @param {string} street - Street address (e.g., "1600 Pennsylvania Avenue NW")
 * @param {Object} [options] - Optional settings
 * @param {string} [options.city] - City (defaults to "Washington")
 * @param {string} [options.state] - State (defaults to "DC")
 * @param {string} [options.zip] - ZIP code
 * @param {Object} [options.kv] - KV namespace for caching
 * @param {number} [options.timeoutMs] - Timeout in ms (default 5000)
 * @returns {Promise<{districts: Object}|{error: string}>}
 */
export async function resolveDCAddress(street, options = {}) {
  const city = options.city || "Washington";
  const state = options.state || "DC";
  const zip = options.zip || "";
  const kv = options.kv || null;
  const timeoutMs = options.timeoutMs || MAR_TIMEOUT_MS;

  // Build the address string for the MAR API
  const addressParts = [street];
  if (city) addressParts.push(city);
  if (state) addressParts.push(state);
  if (zip) addressParts.push(zip);
  const addressStr = addressParts.join(", ");

  // Check KV cache first
  const cacheKey = buildMARCacheKey(street, city, state, zip);
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, "json");
      if (cached) {
        return { districts: cached, cached: true };
      }
    } catch {
      // Cache miss or error — proceed to API call
    }
  }

  // Call the MAR API with timeout
  const marUrl = `${MAR_BASE_URL}?f=json&str=${encodeURIComponent(addressStr)}`;

  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    response = await fetch(marUrl, { signal: controller.signal });
    clearTimeout(timer);
  } catch (err) {
    if (err.name === "AbortError") {
      return { error: "mar_timeout" };
    }
    return { error: "mar_unavailable" };
  }

  if (!response.ok) {
    return { error: "mar_unavailable" };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { error: "mar_invalid_response" };
  }

  const parsed = parseMARResponse(data);
  if (!parsed) {
    return { error: "address_not_found" };
  }

  // Cache successful results
  if (kv) {
    try {
      await kv.put(cacheKey, JSON.stringify(parsed), { expirationTtl: MAR_CACHE_TTL });
    } catch {
      // Non-critical — caching failure shouldn't break the response
    }
  }

  return { districts: parsed, cached: false };
}
