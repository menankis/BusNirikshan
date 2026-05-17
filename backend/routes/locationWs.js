const { getSubscriber, CHANNEL_PATTERN } = require("../utils/pubsub");
const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// Subscription registry
//
// subscriptions: Map<busId, Set<WebSocket>>
//   Tracks which WebSocket clients are listening to which bus.
//
// clientBuses: WeakMap<WebSocket, Set<busId>>
//   Inverse index — lets us clean up all of a client's subs on disconnect.
// ─────────────────────────────────────────────────────────────────────────────
const subscriptions = new Map();   // busId → Set<ws>
const clientBuses   = new WeakMap(); // ws    → Set<busId>

const MAX_SUBS_PER_CLIENT = 50; // cumulative cap per WebSocket connection

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function addSub(ws, busId) {
    // Forward map
    if (!subscriptions.has(busId)) subscriptions.set(busId, new Set());
    subscriptions.get(busId).add(ws);

    // Inverse map
    if (!clientBuses.has(ws)) clientBuses.set(ws, new Set());
    clientBuses.get(ws).add(busId);
}

function removeSub(ws, busId) {
    const subs = subscriptions.get(busId);
    if (subs) {
        subs.delete(ws);
        if (subs.size === 0) subscriptions.delete(busId);
    }
    const buses = clientBuses.get(ws);
    if (buses) buses.delete(busId);
}

function removeClient(ws) {
    const buses = clientBuses.get(ws);
    if (!buses) return;
    for (const busId of buses) {
        const subs = subscriptions.get(busId);
        if (subs) {
            subs.delete(ws);
            if (subs.size === 0) subscriptions.delete(busId);
        }
    }
    clientBuses.delete(ws);
}

function send(ws, data) {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap Redis subscriber (called once at server start)
//
// Uses psubscribe("bus:location:*") so a single subscriber connection handles
// all buses without needing to SUBSCRIBE per bus.
// ─────────────────────────────────────────────────────────────────────────────
function startRedisSubscriber() {
    const sub = getSubscriber();
    if (!sub) {
        console.warn("[ws] Redis subscriber unavailable — live push disabled.");
        return;
    }

    sub.psubscribe(CHANNEL_PATTERN, (err) => {
        if (err) {
            console.error("[ws] psubscribe error:", err.message);
        } else {
            console.log(`[ws] Subscribed to Redis pattern: ${CHANNEL_PATTERN}`);
        }
    });

    // pmessage fires for every message matching the pattern
    sub.on("pmessage", (_pattern, channel, raw) => {
        // Extract busId from channel name "bus:location:{busId}"
        const busId = channel.split(":")[2];
        if (!busId) return;

        const clients = subscriptions.get(busId);
        if (!clients || clients.size === 0) return;

        let payload;
        try {
            payload = JSON.parse(raw);
        } catch {
            console.error("[ws] Failed to parse Redis message:", raw);
            return;
        }

        const message = { type: "location", ...payload };

        for (const ws of clients) {
            send(ws, message);
        }
    });
}

/**
 * @route   WS /api/locations/livewebsocket
 * @desc    WebSocket endpoint for real-time bus locations
 * @access  Public
 * 
 * Client protocol:
 *   → { "type": "subscribe",   "busIds": ["id1", "id2"] }
 *   → { "type": "unsubscribe", "busIds": ["id1"] }
 *
 * Server push:
 *   ← { "type": "location", "busId": "...", "lat": ..., "lng": ..., ... }
 *   ← { "type": "error", "message": "..." }
 *   ← { "type": "ack", "subscribed": [...], "unsubscribed": [...] }
 */
function locationWsHandler(ws, _req) {
    send(ws, {
        type: "connected",
        message: "Connected. Send { type: 'subscribe', busIds: ['...'] } to receive updates."
    });

    ws.on("message", (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return send(ws, { type: "error", message: "Invalid JSON" });
        }

        const { type, busIds } = msg;

        if (!Array.isArray(busIds) || busIds.length === 0) {
            return send(ws, { type: "error", message: "'busIds' must be a non-empty array" });
        }

        // Sanitise: allow only non-empty strings, max 50 buses per client
        const valid = busIds
            .filter(id => typeof id === "string" && id.trim().length > 0 && mongoose.isValidObjectId(id))
            .slice(0, 50);

        if (type === "subscribe") {
            const existing = clientBuses.get(ws)?.size ?? 0;
            const slotsRemaining = MAX_SUBS_PER_CLIENT - existing;
            if (slotsRemaining <= 0) {
                return send(ws, {
                    type: "error",
                    message: `Subscription limit reached (max ${MAX_SUBS_PER_CLIENT} buses per connection)`
                });
            }
            const toAdd = valid.slice(0, slotsRemaining);
            for (const busId of toAdd) addSub(ws, busId);
            send(ws, { type: "ack", action: "subscribed", busIds: toAdd });

        } else if (type === "unsubscribe") {
            for (const busId of valid) removeSub(ws, busId);
            send(ws, { type: "ack", action: "unsubscribed", busIds: valid });

        } else {
            send(ws, { type: "error", message: `Unknown message type: '${type}'` });
        }
    });

    ws.on("close", () => removeClient(ws));
    ws.on("error", (err) => {
        console.error("[ws] Client error:", err.message);
        removeClient(ws);
    });
}

module.exports = { locationWsHandler, startRedisSubscriber };
