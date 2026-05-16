const Redis = require("ioredis");

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Redis client
// Upstash requires TLS — ioredis handles "rediss://" URLs automatically.
// ─────────────────────────────────────────────────────────────────────────────
let client;

function getClient() {
    if (!client) {
        const url = process.env.REDIS_URL;
        if (!url) {
            console.warn("[cache] REDIS_URL not set — caching is disabled.");
            return null;
        }
        client = new Redis(url, {
            maxRetriesPerRequest: 0,
            enableReadyCheck: false,   // required for Upstash serverless
            lazyConnect: false,
        });

        client.on("error", (err) => {
            // Log but don't crash — degrade gracefully if Redis is unavailable
            console.error("[cache] Redis error:", err.message);
        });
    }
    return client;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stable query-string serialiser
// Sorts keys alphabetically so query params in any order produce the same key.
// e.g. { page: 2, limit: 20, rtc: "GSRTC" } → "limit=20&page=2&rtc=GSRTC"
// ─────────────────────────────────────────────────────────────────────────────
function stableQueryString(queryObj) {
    return Object.keys(queryObj)
        .sort()
        .flatMap(k => {
            const v = queryObj[k];
            // Array values (e.g. ?rtc=GSRTC&rtc=MSRTC) produce one pair per element
            // so they generate a different key from the single-value ?rtc=GSRTC,MSRTC
            if (Array.isArray(v)) {
                return v.map(item => `${encodeURIComponent(k)}=${encodeURIComponent(item)}`);
            }
            return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
        })
        .join("&");
}

// ─────────────────────────────────────────────────────────────────────────────
// getOrSet(key, ttlSeconds, fetchFn)
//
// Returns the cached value for `key` if present, otherwise calls `fetchFn()`,
// stores its result in Redis with the given TTL, and returns it.
//
// If Redis is unavailable, falls through to `fetchFn()` transparently.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
async function getOrSet(key, ttlSeconds, fetchFn) {
    const redis = getClient();

    if (redis) {
        try {
            const cached = await redis.get(key);
            if (cached !== null) {
                return JSON.parse(cached);
            }
        } catch (err) {
            console.error(`[cache] GET error for key "${key}":`, err.message);
        }
    }

    // Cache miss (or Redis unavailable) — fetch from DB
    const data = await fetchFn();

    if (redis && data !== undefined && data !== null) {
        try {
            await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
        } catch (err) {
            console.error(`[cache] SET error for key "${key}":`, err.message);
        }
    }

    return data;
}

// ────────────────────────────────────────────────────────────────────────────
// invalidate(...patterns)
//
// Deletes all Redis keys matching any of the given glob patterns.
// Uses SCAN to avoid blocking the server with KEYS on large datasets.
//
// Usage:
//   await invalidate("buses:list:*")
//   await invalidate("buses:detail:abc123", "buses:status:abc123")
// ─────────────────────────────────────────────────────────────────────────────
async function invalidate(...patterns) {
    const redis = getClient();
    if (!redis) return;

    for (const pattern of patterns) {
        try {
            if (!pattern.includes("*")) {
                await redis.del(pattern);
                continue;
            }

            let cursor = "0";
            do {
                const [nextCursor, keys] = await redis.scan(
                    cursor,
                    "MATCH", pattern,
                    "COUNT", 100
                );
                cursor = nextCursor;
                if (keys.length > 0) {
                    await redis.del(...keys);
                }
            } while (cursor !== "0");
        } catch (err) {
            console.error(`[cache] INVALIDATE error for pattern "${pattern}":`, err.message);
        }
    }
}

module.exports = { getOrSet, invalidate, stableQueryString };
