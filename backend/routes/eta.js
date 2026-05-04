const express = require("express");
const mongoose = require("mongoose");
const Bus = require("../models/bus");
const Stop = require("../models/stop");
const { getDistanceKm } = require("../utils/geo");

const router = express.Router();

const DEFAULT_SPEED_KMH = 40; // fallback when bus has no speed data

// ── GET /api/eta ──────────────────────────────────────────────────────────────
// Batch ETA for multiple buses to a single stop.
// Query: ?stopId=X&busIds=A,B,C
//
// This is the passenger-facing "which bus arrives first?" endpoint.
// It reuses the same Haversine util from buses.js but runs it for N buses at once.
router.get("/", async (req, res) => {
  try {
    const { stopId, busIds } = req.query;

    if (!stopId || !mongoose.isValidObjectId(stopId)) {
      return res.status(400).json({ message: "Valid stopId query param is required" });
    }

    if (!busIds) {
      return res.status(400).json({ message: "busIds query param is required (comma-separated)" });
    }

    // parse "A,B,C" → ["A","B","C"] and validate each
    const busIdList = busIds.split(",").map((id) => id.trim());
    const invalidIds = busIdList.filter((id) => !mongoose.isValidObjectId(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        message: `Invalid busId(s): ${invalidIds.join(", ")}`,
      });
    }

    // fetch the stop and all buses in parallel
    const [stop, buses] = await Promise.all([
      Stop.findById(stopId, "name location").lean(),
      Bus.find({ _id: { $in: busIdList } }, "registrationNumber routeName lastKnownLocation isActive").lean(),
    ]);

    if (!stop) return res.status(404).json({ message: "Stop not found" });
    if (!stop.location?.coordinates || stop.location.coordinates.length < 2) {
      return res.status(400).json({ message: "Stop has no valid location data" });
    }

    const [stopLng, stopLat] = stop.location.coordinates;

    // build ETA for each requested bus
    const results = busIdList.map((id) => {
      const bus = buses.find((b) => b._id.toString() === id);

      if (!bus) return { busId: id, status: "not_found" };

      if (!bus.isActive) return { busId: id, registrationNumber: bus.registrationNumber, status: "inactive" };

      const coords = bus.lastKnownLocation?.coordinates;
      if (!coords || coords.length < 2) {
        return { busId: id, registrationNumber: bus.registrationNumber, status: "no_location" };
      }

      const [busLng, busLat] = coords;
      const distanceKm = getDistanceKm(busLat, busLng, stopLat, stopLng);
      const speedKmh = bus.lastKnownLocation?.speed_kmh > 0
        ? bus.lastKnownLocation.speed_kmh
        : DEFAULT_SPEED_KMH;
      const etaMinutes = Math.round((distanceKm / speedKmh) * 60);

      return {
        busId: id,
        registrationNumber: bus.registrationNumber,
        routeName: bus.routeName,
        status: "ok",
        distance_km: parseFloat(distanceKm.toFixed(2)),
        speed_kmh: speedKmh,
        eta_minutes: etaMinutes,
      };
    });

    // sort valid results by ETA so the closest bus is first
    const sorted = [
      ...results.filter((r) => r.status === "ok").sort((a, b) => a.eta_minutes - b.eta_minutes),
      ...results.filter((r) => r.status !== "ok"),
    ];

    return res.status(200).json({
      message: "Batch ETA calculated successfully",
      stop: { id: stopId, name: stop.name },
      results: sorted,
    });
  } catch (err) {
    console.error("[GET /eta]", err);
    return res.status(500).json({ message: "Failed to calculate ETA" });
  }
});

// ── GET /api/eta/stop/:stopId ─────────────────────────────────────────────────
// ETA for ALL active buses within a radius of a given stop.
// Query: ?radius_km=5  (default 10 km)
//
// Useful for the passenger app — "show me every bus heading toward this stop"
router.get("/stop/:stopId", async (req, res) => {
  try {
    const { stopId } = req.params;
    const radius_km = parseFloat(req.query.radius_km) || 10;

    if (!mongoose.isValidObjectId(stopId)) {
      return res.status(400).json({ message: "Invalid stopId" });
    }

    if (radius_km <= 0 || radius_km > 100) {
      return res.status(400).json({ message: "radius_km must be between 0 and 100" });
    }

    const stop = await Stop.findById(stopId, "name location").lean();
    if (!stop) return res.status(404).json({ message: "Stop not found" });
    if (!stop.location?.coordinates || stop.location.coordinates.length < 2) {
      return res.status(400).json({ message: "Stop has no valid location data" });
    }

    const [stopLng, stopLat] = stop.location.coordinates;
    const radiusMeters = radius_km * 1000;

    // use MongoDB's $nearSphere index to efficiently find nearby active buses
    const nearbyBuses = await Bus.find({
      isActive: true,
      "lastKnownLocation.coordinates": {
        $nearSphere: {
          $geometry: { type: "Point", coordinates: [stopLng, stopLat] },
          $maxDistance: radiusMeters,
        },
      },
    })
      .select("registrationNumber routeName lastKnownLocation")
      .lean();

    if (nearbyBuses.length === 0) {
      return res.status(200).json({
        message: "No active buses found near this stop",
        stop: { id: stopId, name: stop.name },
        results: [],
      });
    }

    // calculate ETA for each nearby bus
    const results = nearbyBuses.map((bus) => {
      const [busLng, busLat] = bus.lastKnownLocation.coordinates;
      const distanceKm = getDistanceKm(busLat, busLng, stopLat, stopLng);
      const speedKmh = bus.lastKnownLocation?.speed_kmh > 0
        ? bus.lastKnownLocation.speed_kmh
        : DEFAULT_SPEED_KMH;
      const etaMinutes = Math.round((distanceKm / speedKmh) * 60);

      return {
        busId: bus._id,
        registrationNumber: bus.registrationNumber,
        routeName: bus.routeName,
        distance_km: parseFloat(distanceKm.toFixed(2)),
        speed_kmh: speedKmh,
        eta_minutes: etaMinutes,
      };
    });

    // closest bus first
    results.sort((a, b) => a.eta_minutes - b.eta_minutes);

    return res.status(200).json({
      message: "Nearby bus ETAs calculated successfully",
      stop: { id: stopId, name: stop.name },
      radius_km,
      results,
    });
  } catch (err) {
    console.error("[GET /eta/stop/:stopId]", err);
    return res.status(500).json({ message: "Failed to calculate ETA" });
  }
});

module.exports = router;