const express = require("express");
const mongoose = require("mongoose");
const Driver = require("../models/driver");
const Bus = require("../models/bus");
const Shift = require("../models/shift");
const requireRole = require("../middleware/requireRole");
const { getOrSet, invalidate, stableQueryString } = require("../utils/cache");
const { parsePagination } = require("../utils/pagination");

const router = express.Router();

// how long (seconds) we cache driver data
const CACHE_TTL = {
  LIST: 30,
  DETAIL: 60,
};

// ── GET /api/drivers ──────────────────────────────────────────────────────────
// Admin only. Supports filtering by ?rtc=X and ?isOnShift=true/false
router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const { rtc, isOnShift } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    if (isOnShift !== undefined && isOnShift !== "true" && isOnShift !== "false") {
      return res.status(400).json({ message: "isOnShift must be 'true' or 'false'" });
    }

    const cacheKey = `drivers:list:${stableQueryString(req.query)}`;

    const data = await getOrSet(cacheKey, CACHE_TTL.LIST, async () => {
      const filter = {};
      if (rtc) filter.rtc = rtc;
      if (isOnShift !== undefined) filter.isOnShift = isOnShift === "true";

      const [total, drivers] = await Promise.all([
        Driver.countDocuments(filter),
        Driver.find(filter)
          .populate("userId", "name email")
          .populate("assignedBusId", "registrationNumber routeName isActive")
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      return {
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1,
        },
        drivers,
      };
    });

    return res.status(200).json({ message: "Drivers fetched successfully", ...data });
  } catch (err) {
    console.error("[GET /drivers]", err);
    return res.status(500).json({ message: "Failed to fetch drivers" });
  }
});

// ── GET /api/drivers/:driverId ────────────────────────────────────────────────
router.get("/:driverId", async (req, res) => {
  try {
    const { driverId } = req.params;

    if (!mongoose.isValidObjectId(driverId)) {
      return res.status(400).json({ message: "Invalid driverId" });
    }

    const driver = await getOrSet(`drivers:detail:${driverId}`, CACHE_TTL.DETAIL, () =>
      Driver.findById(driverId)
        .populate("userId", "name email")
        .populate("assignedBusId", "registrationNumber routeName isActive")
        .lean()
    );

    if (!driver) return res.status(404).json({ message: "Driver not found" });

    return res.status(200).json({ message: "Driver fetched successfully", driver });
  } catch (err) {
    console.error("[GET /drivers/:driverId]", err);
    return res.status(500).json({ message: "Failed to fetch driver" });
  }
});

// ── POST /api/drivers ─────────────────────────────────────────────────────────
// Admin only. Links an existing User to a Driver profile.
// ── POST /api/drivers ─────────────────────────────────────────────────────────
// Admin only. Links an existing User to a Driver profile.
router.post("/", requireRole("admin"), async (req, res) => {
  try {
    const { userId, rtc, licenseNumber } = req.body;

    if (!userId || !rtc || !licenseNumber) {
      return res.status(400).json({ message: "userId, rtc and licenseNumber are required" });
    }

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    // license number format validation — must be like GJ01-20240001
    const licenseRegex = /^[A-Z]{2}\d{2}-\d{4,8}$/;
    if (!licenseRegex.test(licenseNumber)) {
      return res.status(400).json({
        message: "Invalid license number format. Expected format: GJ01-20240001"
      });
    }

    // make sure this user isn't already a driver and license is unique
    const conflict = await Driver.findOne({ $or: [{ userId }, { licenseNumber }] });
    if (conflict) {
      const reason =
        conflict.userId.toString() === userId
          ? "This user already has a driver profile"
          : "License number is already registered";
      return res.status(409).json({ message: reason });
    }

    const driver = await Driver.create({ userId, rtc, licenseNumber });
    await invalidate("drivers:list:*");

    return res.status(201).json({ message: "Driver created successfully", driver });
  } catch (err) {
    console.error("[POST /drivers]", err);
    return res.status(500).json({ message: "Failed to create driver" });
  }
});

// ── PATCH /api/drivers/:driverId ──────────────────────────────────────────────
// Admin only. Update rtc, licenseNumber, or assignedBusId.
router.patch("/:driverId", requireRole("admin"), async (req, res) => {
  try {
    const { driverId } = req.params;

    if (!mongoose.isValidObjectId(driverId)) {
      return res.status(400).json({ message: "Invalid driverId" });
    }

    const allowed = ["rtc", "licenseNumber", "assignedBusId"];
    const updates = {};

    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields provided to update" });
    }

    if (updates.assignedBusId && !mongoose.isValidObjectId(updates.assignedBusId)) {
      return res.status(400).json({ message: "Invalid assignedBusId" });
    }

    const updated = await Driver.findByIdAndUpdate(
      driverId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Driver not found" });

    await invalidate(`drivers:detail:${driverId}`, "drivers:list:*");

    return res.status(200).json({ message: "Driver updated successfully", driver: updated });
  } catch (err) {
    console.error("[PATCH /drivers/:driverId]", err);
    return res.status(500).json({ message: "Failed to update driver" });
  }
});

// ── DELETE /api/drivers/:driverId ─────────────────────────────────────────────
// Admin only. Removes the driver profile — does NOT delete the User account.
router.delete("/:driverId", requireRole("admin"), async (req, res) => {
  try {
    const { driverId } = req.params;

    if (!mongoose.isValidObjectId(driverId)) {
      return res.status(400).json({ message: "Invalid driverId" });
    }

    const driver = await Driver.findById(driverId);
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    if (driver.isOnShift) {
      return res.status(400).json({ message: "Cannot delete a driver who is currently on shift" });
    }

    await driver.deleteOne();
    await invalidate(`drivers:detail:${driverId}`, "drivers:list:*");

    return res.status(200).json({ message: "Driver deleted successfully" });
  } catch (err) {
    console.error("[DELETE /drivers/:driverId]", err);
    return res.status(500).json({ message: "Failed to delete driver" });
  }
});

// ── POST /api/drivers/:driverId/shift/start ───────────────────────────────────
// Driver starts a shift on a specific bus.
// This is the key endpoint — it sets bus.isActive = true so the bus
// immediately shows up on the passenger live map.
router.post("/:driverId/shift/start", async (req, res) => {
  try {
    const { driverId } = req.params;
    const { busId } = req.body;

    if (!mongoose.isValidObjectId(driverId)) {
      return res.status(400).json({ message: "Invalid driverId" });
    }
    if (!busId || !mongoose.isValidObjectId(busId)) {
      return res.status(400).json({ message: "Valid busId is required in body" });
    }

    const [driver, bus] = await Promise.all([
      Driver.findById(driverId),
      Bus.findById(busId),
    ]);

    if (!driver) return res.status(404).json({ message: "Driver not found" });
    if (!bus) return res.status(404).json({ message: "Bus not found" });

    if (driver.isOnShift) {
      return res.status(400).json({ message: "Driver is already on shift. End the current shift first." });
    }

    // Prevent two drivers running the same bus simultaneously
    const busAlreadyActive = await Driver.findOne({ assignedBusId: busId, isOnShift: true });
    if (busAlreadyActive) {
      return res.status(409).json({ message: "This bus is already on an active shift with another driver" });
    }

    // Record shift start
    const shift = await Shift.create({
      driverId,
      busId,
      startedAt: new Date(),
      startLocation: {
        lat: bus.lastKnownLocation?.coordinates?.[1] ?? 0,
        lng: bus.lastKnownLocation?.coordinates?.[0] ?? 0,
      },
    });

    // Activate driver + bus at the same time
    await Promise.all([
      Driver.findByIdAndUpdate(driverId, {
        $set: { assignedBusId: busId, isOnShift: true, shiftStartedAt: shift.startedAt },
        $inc: { totalShifts: 1 },
      }),
      Bus.findByIdAndUpdate(busId, { $set: { isActive: true } }),
    ]);

    await invalidate(
      `drivers:detail:${driverId}`,
      "drivers:list:*",
      `buses:detail:${busId}`,
      `buses:status:${busId}`,
      "buses:list:*"
    );

    return res.status(200).json({
      message: "Shift started. Bus is now live on the map.",
      shiftId: shift._id,
      busId,
      startedAt: shift.startedAt,
    });
  } catch (err) {
    console.error("[POST /drivers/:driverId/shift/start]", err);
    return res.status(500).json({ message: "Failed to start shift" });
  }
});

// ── POST /api/drivers/:driverId/shift/end ─────────────────────────────────────
// Driver ends their active shift. Bus goes inactive on the live map.
router.post("/:driverId/shift/end", async (req, res) => {
  try {
    const { driverId } = req.params;

    if (!mongoose.isValidObjectId(driverId)) {
      return res.status(400).json({ message: "Invalid driverId" });
    }

    const driver = await Driver.findById(driverId);
    if (!driver) return res.status(404).json({ message: "Driver not found" });
    if (!driver.isOnShift) return res.status(400).json({ message: "Driver is not on an active shift" });

    const busId = driver.assignedBusId;
    const endedAt = new Date();

    // Close the open shift record
    const activeShift = await Shift.findOne({ driverId, endedAt: null }).sort({ startedAt: -1 });
    if (activeShift) {
      const bus = await Bus.findById(busId, "lastKnownLocation");
      activeShift.endedAt = endedAt;
      activeShift.durationMin = Math.round((endedAt - activeShift.startedAt) / 60000);
      if (bus?.lastKnownLocation?.coordinates?.length >= 2) {
        activeShift.endLocation = {
          lat: bus.lastKnownLocation.coordinates[1],
          lng: bus.lastKnownLocation.coordinates[0],
        };
      }
      await activeShift.save();
    }

    // Deactivate driver shift state + take bus off the map
    await Promise.all([
      Driver.findByIdAndUpdate(driverId, {
        $set: { isOnShift: false, shiftStartedAt: null },
      }),
      Bus.findByIdAndUpdate(busId, { $set: { isActive: false } }),
    ]);

    await invalidate(
      `drivers:detail:${driverId}`,
      "drivers:list:*",
      `buses:detail:${busId}`,
      `buses:status:${busId}`,
      "buses:list:*"
    );

    return res.status(200).json({
      message: "Shift ended. Bus is now off the map.",
      shiftId: activeShift?._id ?? null,
      busId,
      endedAt,
      durationMin: activeShift?.durationMin ?? null,
    });
  } catch (err) {
    console.error("[POST /drivers/:driverId/shift/end]", err);
    return res.status(500).json({ message: "Failed to end shift" });
  }
});

// ── GET /api/drivers/:driverId/shifts ─────────────────────────────────────────
// Returns shift history for a driver with pagination
// Query: ?page=1&limit=10
router.get("/:driverId/shifts", async (req, res) => {
  try {
    const { driverId } = req.params;

    if (!mongoose.isValidObjectId(driverId)) {
      return res.status(400).json({ message: "Invalid driverId" });
    }

    const { parsePagination } = require("../utils/pagination");
    const { page, limit, skip } = parsePagination(req.query);

    const driver = await Driver.findById(driverId, "userId rtc").lean();
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const [total, shifts] = await Promise.all([
      Shift.countDocuments({ driverId }),
      Shift.find({ driverId })
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    return res.status(200).json({
      message: "Shift history fetched successfully",
      driver: { id: driverId, rtc: driver.rtc },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      },
      shifts
    });
  } catch (err) {
    console.error("[GET /drivers/:driverId/shifts]", err);
    return res.status(500).json({ message: "Failed to fetch shift history" });
  }
});

module.exports = router;