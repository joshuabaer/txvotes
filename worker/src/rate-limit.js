// Per-IP rate limiting using Cloudflare KV
// Fail-open: if KV read/write fails, the request is allowed through.

/**
 * Check whether a request from the given IP should be rate-limited.
 *
 * Uses a sliding-window counter stored in KV with a short TTL so entries
 * auto-expire.  The key format is `ratelimit:{endpoint}:{ip}:{windowId}`
 * where windowId = Math.floor(Date.now() / (windowSeconds * 1000)).
 *
 * @param {object} env          - Worker env (must have ELECTION_DATA KV binding)
 * @param {string} ip           - Client IP address (from CF-Connecting-IP header)
 * @param {string} endpoint     - Logical endpoint name (e.g. "guide", "summary")
 * @param {number} maxRequests  - Maximum requests allowed per window (default 10)
 * @param {number} windowSeconds - Window duration in seconds (default 60)
 * @returns {Promise<{allowed: boolean, remaining: number, retryAfter: number}>}
 */
export async function checkRateLimit(env, ip, endpoint, maxRequests = 10, windowSeconds = 60) {
  try {
    if (!env || !env.ELECTION_DATA || !ip) {
      // Cannot enforce limits without KV or IP — fail open
      return { allowed: true, remaining: maxRequests, retryAfter: 0 };
    }

    var windowId = Math.floor(Date.now() / (windowSeconds * 1000));
    var key = "ratelimit:" + endpoint + ":" + ip + ":" + windowId;

    // Read current count
    var raw = await env.ELECTION_DATA.get(key);
    var count = raw ? parseInt(raw, 10) : 0;

    if (count >= maxRequests) {
      // Calculate seconds until the current window expires
      var windowStart = windowId * windowSeconds * 1000;
      var windowEnd = windowStart + windowSeconds * 1000;
      var retryAfter = Math.ceil((windowEnd - Date.now()) / 1000);
      if (retryAfter < 1) retryAfter = 1;
      return { allowed: false, remaining: 0, retryAfter: retryAfter };
    }

    // Increment counter (fire-and-forget write — don't block the request)
    count += 1;
    // expirationTtl must be >= 60 on Cloudflare KV; use max(windowSeconds, 60)
    var ttl = Math.max(windowSeconds, 60);
    env.ELECTION_DATA.put(key, String(count), { expirationTtl: ttl }).catch(function () {
      // Swallow write errors — fail open
    });

    return { allowed: true, remaining: maxRequests - count, retryAfter: 0 };
  } catch (err) {
    // Any unexpected error — fail open so legitimate users aren't blocked
    return { allowed: true, remaining: maxRequests, retryAfter: 0 };
  }
}

/**
 * Build an HTTP 429 Too Many Requests response.
 *
 * @param {number} retryAfter - Seconds until the client should retry
 * @returns {Response}
 */
export function rateLimitResponse(retryAfter) {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again later.",
      retryAfter: retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Retry-After": String(retryAfter),
      },
    }
  );
}
