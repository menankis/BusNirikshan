const express = require("express");
const mongoose = require("mongoose");
const authorise = require("../middleware/authorise");
const Driver = require("../models/driver");
const Bus = require("../models/bus");
const BusLocation = require("../models/buslocation");
const Shift = require("../models/shift");
const { getOrSet, invalidate, stableQueryString } = require("../utils/cache");

const router = express.Router();

// Cache TTLs (seconds)
const TTL = {
    LIVE_ALL: 5,   // all active buses — passengers see near real-time map
    LIVE_ONE: 5,   // single bus location
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/locations
// Driver submits a real-time GPS update.
//
// Auth:   Bearer token required (role must be "driver")
// Body:   { lat, lng, speed_kmh?, heading_deg?, timestamp? }
//
// On success, three writes happen atomically-ish in parallel:
//   1. BusLocation  — insert a new time-series document (permanent log, TTL 24h)
//   2. Bus          — update lastKnownLocation GeoJSON point (enables $near queries)
//   3. Shift        — increment totalPointsRecorded counter
//
// Cache invalidation:
//   Wipes live-location entries for this bus and all-bus live list, plus
//   stop-level bus-ETA caches and the per-bus status/eta entries.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", authorise, async (req, res) => {
    try {
        // ── 1. Role guard ────────────────────────────────────────────────────
        if (req.user.role !== "driver") {
            return res.status(403).json({
                message: "Forbidden: Only drivers can submit GPS updates"
            });
        }

        // ── 2. Payload validation ────────────────────────────────────────────
        const { lat, lng, speed_kmh, heading_deg, timestamp } = req.body;

        if (lat === undefined || lat === null || lng === undefined || lng === null) {
            return res.status(400).json({
                message: "Validation Error: 'lat' and 'lng' are required"
            });
        }

        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);

        if (isNaN(parsedLat) || isNaN(parsedLng)) {
            return res.status(400).json({
                message: "Validation Error: 'lat' and 'lng' must be valid numbers"
            });
        }
        if (parsedLat < -90 || parsedLat > 90) {
            return res.status(400).json({
                message: "Validation Error: 'lat' must be between -90 and 90"
            });
        }
        if (parsedLng < -180 || parsedLng > 180) {
            return res.status(400).json({
                message: "Validation Error: 'lng' must be between -180 and 180"
            });
        }

        const parsedSpeed   = speed_kmh   !== undefined ? parseFloat(speed_kmh)   : undefined;
        const parsedHeading = heading_deg !== undefined ? parseFloat(heading_deg)  : undefined;

        if (parsedSpeed !== undefined && (isNaN(parsedSpeed) || parsedSpeed < 0)) {
            return res.status(400).json({
                message: "Validation Error: 'speed_kmh' must be a non-negative number"
            });
        }
        if (parsedHeading !== undefined && (isNaN(parsedHeading) || parsedHeading < 0 || parsedHeading > 360)) {
            return res.status(400).json({
                message: "Validation Error: 'heading_deg' must be between 0 and 360"
            });
        }

        let recordedAt = new Date();
        if (timestamp !== undefined && timestamp !== null) {
            recordedAt = new Date(timestamp);
            if (isNaN(recordedAt.getTime())) {
                return res.status(400).json({
                    message: "Validation Error: 'timestamp' must be a valid ISO date string or epoch milliseconds"
                });
            }
        }

        // ── 3. Driver record lookup & shift guard ────────────────────────────
        const driver = await Driver.findOne({ userId: req.user.userId });

        if (!driver) {
            return res.status(403).json({
                message: "Forbidden: No driver profile found for this account"
            });
        }
        if (!driver.isOnShift) {
            return res.status(403).json({
                message: "Forbidden: Driver is not currently on shift"
            });
        }
        if (!driver.assignedBusId) {
            return res.status(403).json({
                message: "Forbidden: Driver has no assigned bus"
            });
        }

        // ── 4. Locate the active shift ───────────────────────────────────────
        const activeShift = await Shift.findOne({
            driverId: driver._id,
            busId: driver.assignedBusId,
            endedAt: null
        }).sort({ startedAt: -1 });

        if (!activeShift) {
            return res.status(403).json({
                message: "Forbidden: No active shift record found. Please start your shift first."
            });
        }

        const busId = driver.assignedBusId;

        // ── 5. Multi-table update (parallel for performance) ─────────────────
        await Promise.all([
            // 5a. BusLocation — append to the time-series log
            BusLocation.create({
                busId,
                timestamp: recordedAt,
                coordinates: { lat: parsedLat, lng: parsedLng },
                ...(parsedSpeed   !== undefined && { speed_kmh:   parsedSpeed }),
                ...(parsedHeading !== undefined && { heading_deg: parsedHeading }),
                driverId: driver._id
            }),

            // 5b. Bus — update the real-time GeoJSON snapshot
            Bus.findByIdAndUpdate(
                busId,
                {
                    $set: {
                        lastKnownLocation: {
                            type: "Point",
                            coordinates: [parsedLng, parsedLat],
                            ...(parsedSpeed   !== undefined && { speed_kmh:   parsedSpeed }),
                            ...(parsedHeading !== undefined && { heading_deg: parsedHeading }),
                            recordedAt
                        }
                    }
                },
                { runValidators: true }
            ),

            // 5c. Shift — increment the points counter
            Shift.findByIdAndUpdate(
                activeShift._id,
                { $inc: { totalPointsRecorded: 1 } }
            )
        ]);

        // ── 6. Cache invalidation ────────────────────────────────────────────
        // Bus moved → invalidate its location, status, ETA caches, all-bus
        // live list, and stop-level ETAs (passengers may be waiting at any stop).
        await invalidate(
            `locations:live:${busId}`,       // single-bus live endpoint
            "locations:live:*",              // all-bus live list (all query combos)
            `buses:status:${busId}`,         // status includes lastKnownLocation
            `buses:eta:${busId}:*`,          // ETA to any stop from this bus
            "stops:buses:*"                  // ETA boards at every stop
        );

        return res.status(201).json({ message: "GPS location updated successfully" });
    } catch (error) {
        console.error("Error updating location:", error);
        res.status(500).json({ message: "Server error while updating location", error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/locations/live
// Returns the latest known position of every active bus.
//
// Auth:    None required (public endpoint — passengers use this)
// Query:   lat + lng — centre point for geospatial query (both required together)
//          radius?  — search radius in km (default: 10, max: 100)
//          rtc?     — filter by RTC operator (GSRTC | MSRTC | RSRTC), repeatable
//          routeId? — filter to buses serving a specific route
//          limit?   — cap result count (default: 50, max: 200)
//
// Cache key encodes the full sorted query string (lat, lng, radius, rtc,
// routeId, limit) so each unique view is cached independently.
// TTL is intentionally short (5 s) for near real-time passenger experience.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/live", async (req, res) => {
    try {
        const { lat, lng, radius, rtc, routeId } = req.query;

        // ── Validation (run before cache so errors are never cached) ─────────
        const hasLat = lat !== undefined && lat !== null && lat !== "";
        const hasLng = lng !== undefined && lng !== null && lng !== "";

        if (hasLat !== hasLng) {
            return res.status(400).json({
                message: "Validation Error: 'lat' and 'lng' must be provided together"
            });
        }

        let parsedLat, parsedLng, radiusKm;

        if (hasLat && hasLng) {
            parsedLat = parseFloat(lat);
            parsedLng = parseFloat(lng);

            if (isNaN(parsedLat) || isNaN(parsedLng)) {
                return res.status(400).json({ message: "Validation Error: 'lat' and 'lng' must be valid numbers" });
            }
            if (parsedLat < -90 || parsedLat > 90) {
                return res.status(400).json({ message: "Validation Error: 'lat' must be between -90 and 90" });
            }
            if (parsedLng < -180 || parsedLng > 180) {
                return res.status(400).json({ message: "Validation Error: 'lng' must be between -180 and 180" });
            }

            const MAX_RADIUS_KM = 100;
            radiusKm = radius !== undefined ? parseFloat(radius) : 10;
            if (isNaN(radiusKm) || radiusKm <= 0) {
                return res.status(400).json({ message: "Validation Error: 'radius' must be a positive number (km)" });
            }
            if (radiusKm > MAX_RADIUS_KM) {
                return res.status(400).json({ message: `Validation Error: 'radius' cannot exceed ${MAX_RADIUS_KM} km` });
            }
        }

        if (routeId && !mongoose.isValidObjectId(routeId)) {
            return res.status(400).json({ message: "Validation Error: 'routeId' is not a valid ObjectId" });
        }

        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

        const cacheKey = `locations:live:${stableQueryString(req.query)}`;

        const buses = await getOrSet(cacheKey, TTL.LIVE_ALL, async () => {
            const filter = {
                isActive: true,
                "lastKnownLocation.coordinates": { $exists: true, $ne: [] }
            };

            if (hasLat && hasLng) {
                filter.lastKnownLocation = {
                    $nearSphere: {
                        $geometry: { type: "Point", coordinates: [parsedLng, parsedLat] },
                        $maxDistance: radiusKm * 1000
                    }
                };
            }
            if (rtc) filter.rtc = { $in: Array.isArray(rtc) ? rtc : [rtc] };
            if (routeId) filter.routeId = routeId;

            return Bus.find(filter, {
                _id: 1, routeName: 1, rtc: 1, routeId: 1, lastKnownLocation: 1
            }).limit(limit).lean();
        });

        return res.status(200).json({
            message: "Live bus locations fetched successfully",
            limit,
            count: buses.length,
            buses
        });
    } catch (error) {
        console.error("Error fetching live locations:", error);
        res.status(500).json({ message: "Server error while fetching live locations", error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/locations/live/:busId
// Returns the latest known position of a single bus.
// TTL 5 s — keyed on busId only (no query params on this endpoint).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/live/:busId", async (req, res) => {
    const { busId } = req.params;
    if (!mongoose.isValidObjectId(busId)) {
        return res.status(400).json({ message: "Validation Error: 'busId' is not a valid ObjectId" });
    }
    try {
        const bus = await getOrSet(`locations:live:${busId}`, TTL.LIVE_ONE, () =>
            Bus.findById(busId, {
                _id: 1, routeName: 1, rtc: 1, routeId: 1, isActive: 1, lastKnownLocation: 1
            }).lean()
        );

        if (!bus) return res.status(404).json({ message: "Bus not found" });

        if (!bus.lastKnownLocation || !bus.lastKnownLocation.coordinates?.length) {
            return res.status(409).json({
                message: "Bus location is not yet available — the bus may not have started its shift"
            });
        }

        return res.status(200).json({ message: "Bus location fetched successfully", bus });
    } catch (error) {
        console.error("Error fetching bus location:", error);
        res.status(500).json({ message: "Server error while fetching bus location", error: error.message });
    }
});

module.exports = router;