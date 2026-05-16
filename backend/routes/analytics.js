const express = require("express");
const mongoose = require("mongoose");
const Bus = require("../models/bus");
const BusLocation = require("../models/buslocation");
const Stop = require("../models/stop");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

function parseEpoch(value, fieldName) {
  const ms = parseInt(value);
  if (isNaN(ms)) throw new Error(`'${fieldName}' must be a valid epoch timestamp in ms`);
  return new Date(ms);
}

// ── GET /api/analytics/bus/:busId/trail ───────────────────────────────────────
router.get("/bus/:busId/trail", async (req, res) => {
  try {
    const { busId } = req.params;
    const { from, to } = req.query;

    if (!mongoose.isValidObjectId(busId)) {
      return res.status(400).json({ message: "Invalid busId" });
    }
    if (!from || !to) {
      return res.status(400).json({ message: "Both 'from' and 'to' epoch timestamps are required" });
    }

    let fromDate, toDate;
    try {
      fromDate = parseEpoch(from, "from");
      toDate   = parseEpoch(to, "to");
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    if (fromDate >= toDate) {
      return res.status(400).json({ message: "'from' must be earlier than 'to'" });
    }

    const bus = await Bus.findById(busId, "registrationNumber routeName").lean();
    if (!bus) return res.status(404).json({ message: "Bus not found" });

    const trail = await BusLocation.find(
      { busId, timestamp: { $gte: fromDate, $lte: toDate } },
      "location timestamp speed_kmh heading_deg"
    )
      .sort({ timestamp: 1 })
      .lean();

    return res.status(200).json({
      message: "Trail fetched successfully",
      bus: { id: busId, registrationNumber: bus.registrationNumber, routeName: bus.routeName },
      from: fromDate,
      to: toDate,
      totalPoints: trail.length,
      trail,
    });
  } catch (err) {
    console.error("[GET /analytics/bus/:busId/trail]", err);
    return res.status(500).json({ message: "Failed to fetch trail data" });
  }
});

// ── GET /api/analytics/bus/:busId/speed ───────────────────────────────────────
// Supports ?from=<epoch>&to=<epoch> OR ?date=YYYY-MM-DD (full day range)
router.get("/bus/:busId/speed", async (req, res) => {
  try {
    const { busId } = req.params;
    const { from, to, interval = "hour" } = req.query;

    if (!mongoose.isValidObjectId(busId)) {
      return res.status(400).json({ message: "Invalid busId" });
    }
    if (!from && !to && !req.query.date) {
      return res.status(400).json({ message: "Either 'date' (YYYY-MM-DD) or both 'from' and 'to' epoch timestamps are required" });
    }
    if (!["hour", "day"].includes(interval)) {
      return res.status(400).json({ message: "interval must be 'hour' or 'day'" });
    }

    let fromDate, toDate;
    try {
      if (req.query.date && !from && !to) {
        const d = new Date(req.query.date);
        if (isNaN(d.getTime())) throw new Error("Invalid date format. Use YYYY-MM-DD");
        fromDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        toDate   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      } else {
        fromDate = parseEpoch(from, "from");
        toDate   = parseEpoch(to, "to");
      }
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    const bus = await Bus.findById(busId, "registrationNumber").lean();
    if (!bus) return res.status(404).json({ message: "Bus not found" });

    const dateGroupExpr = interval === "hour"
      ? { year: { $year: "$timestamp" }, month: { $month: "$timestamp" }, day: { $dayOfMonth: "$timestamp" }, hour: { $hour: "$timestamp" } }
      : { year: { $year: "$timestamp" }, month: { $month: "$timestamp" }, day: { $dayOfMonth: "$timestamp" } };

    const stats = await BusLocation.aggregate([
      {
        $match: {
          busId: new mongoose.Types.ObjectId(busId),
          timestamp: { $gte: fromDate, $lte: toDate },
          speed_kmh: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: dateGroupExpr,
          avgSpeed: { $avg: "$speed_kmh" },
          maxSpeed: { $max: "$speed_kmh" },
          minSpeed: { $min: "$speed_kmh" },
          readings: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1 } },
    ]);

    return res.status(200).json({
      message: "Speed analytics fetched successfully",
      bus: { id: busId, registrationNumber: bus.registrationNumber },
      interval,
      from: fromDate,
      to: toDate,
      stats: stats.map((s) => ({
        period: s._id,
        avgSpeed_kmh: parseFloat(s.avgSpeed.toFixed(1)),
        maxSpeed_kmh: parseFloat(s.maxSpeed.toFixed(1)),
        minSpeed_kmh: parseFloat(s.minSpeed.toFixed(1)),
        readings: s.readings,
      })),
    });
  } catch (err) {
    console.error("[GET /analytics/bus/:busId/speed]", err);
    return res.status(500).json({ message: "Failed to fetch speed analytics" });
  }
});

// ── GET /api/analytics/stops/:stopId/traffic ─────────────────────────────────
// Supports ?from=<epoch>&to=<epoch> OR ?date=YYYY-MM-DD (full day range)
// FIX: switched from $nearSphere to $geoWithin/$centerSphere
router.get("/stops/:stopId/traffic", async (req, res) => {
  try {
    const { stopId } = req.params;
    const { from, to } = req.query;

    if (!mongoose.isValidObjectId(stopId)) {
      return res.status(400).json({ message: "Invalid stopId" });
    }
    if (!from && !to && !req.query.date) {
      return res.status(400).json({ message: "Either 'date' (YYYY-MM-DD) or both 'from' and 'to' epoch timestamps are required" });
    }

    let fromDate, toDate;
    try {
      if (req.query.date && !from && !to) {
        const d = new Date(req.query.date);
        if (isNaN(d.getTime())) throw new Error("Invalid date format. Use YYYY-MM-DD");
        fromDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        toDate   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      } else {
        fromDate = parseEpoch(from, "from");
        toDate   = parseEpoch(to, "to");
      }
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    const stop = await Stop.findById(stopId, "name location").lean();
    if (!stop) return res.status(404).json({ message: "Stop not found" });
    if (!stop.location?.coordinates || stop.location.coordinates.length < 2) {
      return res.status(400).json({ message: "Stop has no valid coordinates" });
    }

    const [lng, lat] = stop.location.coordinates;
    const PROXIMITY_METERS = 200;
    const radiusRadians = PROXIMITY_METERS / 6378100;

    const count = await BusLocation.countDocuments({
      timestamp: { $gte: fromDate, $lte: toDate },
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians],
        },
      },
    });

    const uniqueBuses = await BusLocation.distinct("busId", {
      timestamp: { $gte: fromDate, $lte: toDate },
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians],
        },
      },
    });

    return res.status(200).json({
      message: "Stop traffic fetched successfully",
      stop: { id: stopId, name: stop.name },
      from: fromDate,
      to: toDate,
      proximityMeters: PROXIMITY_METERS,
      totalPings: count,
      uniqueBusCount: uniqueBuses.length,
      uniqueBusIds: uniqueBuses,
    });
  } catch (err) {
    console.error("[GET /analytics/stops/:stopId/traffic]", err);
    return res.status(500).json({ message: "Failed to fetch stop traffic" });
  }
});

// ── GET /api/analytics/system/active-buses ────────────────────────────────────
router.get("/system/active-buses", requireRole("admin"), async (req, res) => {
  try {
    const breakdown = await Bus.aggregate([
      {
        $group: {
          _id: { rtc: "$rtc", isActive: "$isActive" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.rtc": 1 } },
    ]);

    const byRtc = {};
    let totalActive = 0;
    let totalInactive = 0;

    for (const row of breakdown) {
      const { rtc, isActive } = row._id;
      if (!byRtc[rtc]) byRtc[rtc] = { active: 0, inactive: 0 };
      if (isActive) {
        byRtc[rtc].active += row.count;
        totalActive += row.count;
      } else {
        byRtc[rtc].inactive += row.count;
        totalInactive += row.count;
      }
    }

    return res.status(200).json({
      message: "System active bus stats fetched successfully",
      summary: {
        totalActive,
        totalInactive,
        total: totalActive + totalInactive,
      },
      byRtc,
    });
  } catch (err) {
    console.error("[GET /analytics/system/active-buses]", err);
    return res.status(500).json({ message: "Failed to fetch system stats" });
  }
});

// ── GET /api/analytics/bus/:busId/summary ─────────────────────────────────────
// Returns a quick summary — total pings, avg speed, max speed
// Supports ?from=<epoch>&to=<epoch> OR ?date=YYYY-MM-DD
router.get("/bus/:busId/summary", async (req, res) => {
  try {
    const { busId } = req.params;
    const { from, to } = req.query;

    if (!mongoose.isValidObjectId(busId)) {
      return res.status(400).json({ message: "Invalid busId" });
    }
    if (!from && !to && !req.query.date) {
      return res.status(400).json({ message: "Either 'date' (YYYY-MM-DD) or both 'from' and 'to' epoch timestamps are required" });
    }

    let fromDate, toDate;
    try {
      if (req.query.date && !from && !to) {
        const d = new Date(req.query.date);
        if (isNaN(d.getTime())) throw new Error("Invalid date format. Use YYYY-MM-DD");
        fromDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
        toDate   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      } else {
        fromDate = parseEpoch(from, "from");
        toDate   = parseEpoch(to, "to");
      }
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    const bus = await Bus.findById(busId, "registrationNumber routeName rtc").lean();
    if (!bus) return res.status(404).json({ message: "Bus not found" });

    const stats = await BusLocation.aggregate([
      {
        $match: {
          busId: new mongoose.Types.ObjectId(busId),
          timestamp: { $gte: fromDate, $lte: toDate },
        },
      },
      {
        $group: {
          _id: null,
          totalPings: { $sum: 1 },
          avgSpeed: { $avg: "$speed_kmh" },
          maxSpeed: { $max: "$speed_kmh" },
        },
      },
    ]);

    const result = stats[0] || { totalPings: 0, avgSpeed: 0, maxSpeed: 0 };

    return res.status(200).json({
      message: "Bus summary fetched successfully",
      bus: {
        id: busId,
        registrationNumber: bus.registrationNumber,
        routeName: bus.routeName,
        rtc: bus.rtc,
      },
      from: fromDate,
      to: toDate,
      summary: {
        totalPings: result.totalPings,
        avgSpeed_kmh: result.avgSpeed ? parseFloat(result.avgSpeed.toFixed(1)) : 0,
        maxSpeed_kmh: result.maxSpeed ? parseFloat(result.maxSpeed.toFixed(1)) : 0,
      },
    });
  } catch (err) {
    console.error("[GET /analytics/bus/:busId/summary]", err);
    return res.status(500).json({ message: "Failed to fetch bus summary" });
  }
});

module.exports = router;