const express = require("express");
const mongoose = require("mongoose");
const requireRole = require("../middleware/requireRole");
const Driver = require("../models/driver");
const Bus = require("../models/bus");
const BusLocation = require("../models/buslocation");
const Shift = require("../models/shift");
const { getOrSet, invalidate, stableQueryString } = require("../utils/cache");
const { publish } = require("../utils/pubsub");

const router = express.Router();

// Cache TTLs (seconds)
const TTL = {
    LIVE_ALL: 5,   // all active buses — passengers see near real-time map
    LIVE_ONE: 5,   // single bus location
};

/**
 * @route   POST /api/locations
 * @desc    Driver submits a real-time GPS update. Body: { lat, lng, speed_kmh?, heading_deg?, timestamp? }
 * @access  Private (Driver)
 * @param   {number} req.body.lat - Latitude
 * @param   {number} req.body.lng - Longitude
 * @param   {number} [req.body.speed_kmh] - Speed in km/h
 * @param   {number} [req.body.heading_deg] - Heading in degrees
 * @param   {string|number} [req.body.timestamp] - Timestamp of the reading
 */
router.post("/", requireRole("driver"), async (req, res) => {
    try {
        // ── 1. Payload validation ────────────────────────────────────────────
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

        // ── 2. Driver record lookup ──────────────────────────────────────────
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

        // ── 7. Pub/Sub — push to WebSocket subscribers (fire-and-forget) ─────
        publish(busId.toString(), {
            lat:         parsedLat,
            lng:         parsedLng,
            ...(parsedSpeed   !== undefined && { speed_kmh:   parsedSpeed }),
            ...(parsedHeading !== undefined && { heading_deg: parsedHeading }),
            timestamp:   recordedAt
        }).catch((err) => console.error("[pubsub] publish failed:", err.message));

        return res.status(201).json({ message: "GPS location updated successfully" });
    } catch (error) {
        console.error("Error updating location:", error);
        res.status(500).json({ message: "Server error while updating location", error: error.message });
    }
});

/**
 * @route   GET /api/locations/live
 * @desc    Returns the latest known position of active buses. Supports spatial filters.
 * @access  Public
 * @param   {number} [req.query.lat] - Latitude for spatial filter
 * @param   {number} [req.query.lng] - Longitude for spatial filter
 * @param   {number} [req.query.radius] - Search radius in km (default 10)
 * @param   {string|string[]} [req.query.rtc] - Filter by RTC operator
 * @param   {string} [req.query.routeId] - Filter by Route ID
 * @param   {number} [req.query.limit] - Max number of results (default 50)
 */
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
            const filter = { isActive: true };

            if (hasLat && hasLng) {
                // $nearSphere implicitly requires a valid 2dsphere location, so
                // the existence check is unnecessary in this branch.
                filter.lastKnownLocation = {
                    $nearSphere: {
                        $geometry: { type: "Point", coordinates: [parsedLng, parsedLat] },
                        $maxDistance: radiusKm * 1000
                    }
                };
            } else {
                // No geo filter — explicitly exclude buses with no recorded location
                filter["lastKnownLocation.coordinates"] = { $exists: true, $ne: [] };
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

/**
 * @route   GET /api/locations/live/:busId
 * @desc    Returns the latest known position of a single bus.
 * @access  Public
 * @param   {string} req.params.busId - Bus ID (Path)
 */
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