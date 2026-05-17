const express = require("express");
const Bus = require("../models/bus");
const { getSubscriber, CHANNEL_PATTERN } = require("../utils/pubsub");

const router = express.Router();

/**
 * @route   GET /api/locations/livesse
 * @desc    Server-Sent Events feed for live bus locations.
 * @access  Private
 * @param   {string} [req.query.busIds] - Comma-separated list of bus IDs to track, or "all"
 */

router.get("/livesse", async (req, res) => {

  // ── 1. Open the SSE stream ─────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // tell nginx not to buffer SSE
  res.flushHeaders();                        // push headers to client immediately

  // ── 2. Decide which buses to track ────────────────────────────────────────
  const { busIds } = req.query;
  let busIdList = [];

  try {
    if (!busIds || busIds === "all") {
      const activeBuses = await Bus.find({ isActive: true }, "_id").limit(50).lean();
      busIdList = activeBuses.map((b) => b._id.toString());
    } else {
      busIdList = busIds.split(",").map((id) => id.trim()).filter(Boolean);
      if (busIdList.length > 50) {
        sendEvent(res, "error", { message: "Maximum 50 buses allowed per SSE connection" });
        return res.end();
      }
    }
  } catch (err) {
    console.error("[SSE] Failed to resolve bus list:", err.message);
    sendEvent(res, "error", { message: "Failed to initialise stream" });
    return res.end();
  }

  // tell the client which buses it is now tracking
  sendEvent(res, "subscribed", {
    busIds: busIdList,
    count: busIdList.length,
    message: busIdList.length === 0
      ? "No active buses right now. Stream is open — updates will arrive as buses go live."
      : `Tracking ${busIdList.length} bus(es)`,
  });

  // ── 3. Get the shared Redis subscriber ────────────────────────────────────
  // We use psubscribe (pattern subscribe) so one subscriber connection handles
  // all bus channels — same approach Maulik uses in locationWs.js
  const sub = getSubscriber();

  if (!sub) {
    sendEvent(res, "error", { message: "Redis is not available — cannot stream live data" });
    return res.end();
  }

  // ── 4. Listen for messages on pattern "bus:location:*" ────────────────────
  // pmessage fires when ANY channel matching the pattern receives a publish.
  // We filter here to only forward updates for buses this client subscribed to.
  const onMessage = (pattern, channel, rawMessage) => {
    try {
      // channel format: "bus:location:<busId>"
      const busId = channel.split(":")[2];

      // if client asked for specific buses, filter out others
      if (busIdList.length > 0 && !busIdList.includes(busId)) return;

      const data = JSON.parse(rawMessage);
      sendEvent(res, "location", data);
    } catch (err) {
      console.error("[SSE] Failed to forward message:", err.message);
    }
  };

  sub.on("pmessage", onMessage);

  // subscribe to the pattern — ioredis is safe to call this multiple times
  sub.psubscribe(CHANNEL_PATTERN).catch((err) => {
    console.error("[SSE] psubscribe error:", err.message);
  });

  // ── 5. Keepalive ping every 25 seconds ────────────────────────────────────
  // SSE comment lines (": ...") are ignored by clients but prevent
  // load balancers / proxies from closing idle connections
  const keepAlive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 25000);

  // ── 6. Cleanup when client disconnects ────────────────────────────────────
  req.on("close", () => {
    clearInterval(keepAlive);
    sub.removeListener("pmessage", onMessage);
    // do NOT punsubscribe here — other SSE/WS clients share this subscriber
  });
});

// ── helper ────────────────────────────────────────────────────────────────────
function sendEvent(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

module.exports = router;