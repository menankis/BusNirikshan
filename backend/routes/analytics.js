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

/**
 * @route   GET /api/analytics/bus/:busId/trail
 * @desc    Get GPS trail for a bus within a time range
 * @access  Private
 * @param   {string} req.params.busId - Bus ID (Path)
 * @param   {string|number} req.query.from - Start epoch timestamp
 * @param   {string|number} req.query.to - End epoch timestamp
 */
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

/**
 * @route   GET /api/analytics/bus/:busId/speed
 * @desc    Get average, min, max speed over time intervals
 * @access  Private
 * @param   {string} req.params.busId - Bus ID (Path)
 * @param   {string|number} [req.query.from] - Start epoch timestamp
 * @param   {string|number} [req.query.to] - End epoch timestamp
 * @param   {string} [req.query.date] - Date in YYYY-MM-DD format
 * @param   {string} [req.query.interval] - Aggregation interval ("hour" | "day")
 */
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

/**
 * @route   GET /api/analytics/stops/:stopId/traffic
 * @desc    Count buses and pings near a stop within a time range
 * @access  Private
 * @param   {string} req.params.stopId - Stop ID (Path)
 * @param   {string|number} [req.query.from] - Start epoch timestamp
 * @param   {string|number} [req.query.to] - End epoch timestamp
 * @param   {string} [req.query.date] - Date in YYYY-MM-DD format
 */
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

/**
 * @route   GET /api/analytics/system/active-buses
 * @desc    Get count of active vs inactive buses by RTC
 * @access  Private (Admin)
 */
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

/**
 * @route   GET /api/analytics/bus/:busId/summary
 * @desc    Quick summary of total pings, avg speed, max speed for a bus
 * @access  Private
 * @param   {string} req.params.busId - Bus ID (Path)
 * @param   {string|number} [req.query.from] - Start epoch timestamp
 * @param   {string|number} [req.query.to] - End epoch timestamp
 * @param   {string} [req.query.date] - Date in YYYY-MM-DD format
 */
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

/**
 * @route   GET /api/analytics/driver/:driverId/stats
 * @desc    Driver performance stats (shifts, hours, avg duration)
 * @access  Private
 * @param   {string} req.params.driverId - Driver ID (Path)
 */
router.get("/driver/:driverId/stats", async (req, res) => {
  try {
    const { driverId } = req.params;

    if (!mongoose.isValidObjectId(driverId)) {
      return res.status(400).json({ message: "Invalid driverId" });
    }

    const Shift = require("../models/shift");
    const Driver = require("../models/driver");

    const driver = await Driver.findById(driverId, "rtc licenseNumber userId")
      .populate("userId", "name email")
      .lean();

    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const stats = await Shift.aggregate([
      {
        $match: {
          driverId: new mongoose.Types.ObjectId(driverId),
          endedAt: { $ne: null }, // only completed shifts
        },
      },
      {
        $group: {
          _id: null,
          totalShifts: { $sum: 1 },
          totalMinutes: { $sum: "$durationMin" },
          avgDurationMin: { $avg: "$durationMin" },
          maxDurationMin: { $max: "$durationMin" },
          minDurationMin: { $min: "$durationMin" },
          totalPings: { $sum: "$totalPointsRecorded" },
        },
      },
    ]);

    const result = stats[0] || {
      totalShifts: 0,
      totalMinutes: 0,
      avgDurationMin: 0,
      maxDurationMin: 0,
      minDurationMin: 0,
      totalPings: 0,
    };

    return res.status(200).json({
      message: "Driver stats fetched successfully",
      driver: {
        id: driverId,
        name: driver.userId?.name,
        email: driver.userId?.email,
        rtc: driver.rtc,
        licenseNumber: driver.licenseNumber,
      },
      stats: {
        totalShifts: result.totalShifts,
        totalHours: parseFloat((result.totalMinutes / 60).toFixed(1)),
        avgShiftDuration_min: result.avgDurationMin
          ? parseFloat(result.avgDurationMin.toFixed(1))
          : 0,
        maxShiftDuration_min: result.maxDurationMin || 0,
        minShiftDuration_min: result.minDurationMin || 0,
        totalGpsPings: result.totalPings,
      },
    });
  } catch (err) {
    console.error("[GET /analytics/driver/:driverId/stats]", err);
    return res.status(500).json({ message: "Failed to fetch driver stats" });
  }
});

module.exports = router;