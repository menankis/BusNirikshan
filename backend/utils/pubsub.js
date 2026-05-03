const Redis = require("ioredis");

// ─────────────────────────────────────────────────────────────────────────────
// Redis Pub/Sub Clients
//
// Redis requires SEPARATE connections for pub and sub roles.
// The cache client in cache.js cannot be reused here.
//
// REDIS_PUBSUB_URL  — dedicated URL for pub/sub (e.g. a self-hosted Redis)
// Falls back to REDIS_URL if not set.
// ─────────────────────────────────────────────────────────────────────────────

const PUBSUB_URL = process.env.REDIS_PUBSUB_URL || process.env.REDIS_URL;

const REDIS_OPTS = {
    maxRetriesPerRequest: null,   // subscriber must retry indefinitely
    enableReadyCheck: true,
    lazyConnect: false,
};

// ── Publisher ─────────────────────────────────────────────────────────────────
let publisher = null;

function getPublisher() {
    if (!publisher) {
        if (!PUBSUB_URL) {
            console.warn("[pubsub] No Redis URL configured — publishing is disabled.");
            return null;
        }
        publisher = new Redis(PUBSUB_URL, { ...REDIS_OPTS, maxRetriesPerRequest: 2 });
        publisher.on("error", (err) =>
            console.error("[pubsub:publisher] Redis error:", err.message)
        );
        publisher.on("connect", () =>
            console.log("[pubsub:publisher] Connected to Redis")
        );
    }
    return publisher;
}

// ── Subscriber ────────────────────────────────────────────────────────────────
let subscriber = null;

function getSubscriber() {
    if (!subscriber) {
        if (!PUBSUB_URL) {
            console.warn("[pubsub] No Redis URL configured — subscribing is disabled.");
            return null;
        }
        subscriber = new Redis(PUBSUB_URL, REDIS_OPTS);
        subscriber.on("error", (err) =>
            console.error("[pubsub:subscriber] Redis error:", err.message)
        );
        subscriber.on("connect", () =>
            console.log("[pubsub:subscriber] Connected to Redis")
        );
    }
    return subscriber;
}

// ── Channel helpers ───────────────────────────────────────────────────────────

/** The Redis channel for a given busId. */
const channelFor = (busId) => `bus:location:${busId}`;

/** Pattern for psubscribe — matches all bus location channels. */
const CHANNEL_PATTERN = "bus:location:*";

// ── publish(busId, payload) ───────────────────────────────────────────────────
/**
 * Publishes a location update for `busId` to Redis.
 * Fire-and-forget — errors are logged but never thrown.
 *
 * @param {string} busId   MongoDB ObjectId string of the bus
 * @param {object} payload { lat, lng, speed_kmh?, heading_deg?, timestamp }
 */
async function publish(busId, payload) {
    const pub = getPublisher();
    if (!pub) return;

    try {
        const channel = channelFor(busId);
        await pub.publish(channel, JSON.stringify({ busId, ...payload }));
    } catch (err) {
        console.error("[pubsub] publish error:", err.message);
    }
}

module.exports = { getSubscriber, publish, CHANNEL_PATTERN };
