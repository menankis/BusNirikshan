const express = require("express");
const mongoose = require("mongoose");
const Stop = require("../models/stop");
const Route = require("../models/route");
const Bus = require("../models/bus");
const requireRole = require("../middleware/requireRole");
const { getOrSet, invalidate, stableQueryString } = require("../utils/cache");
const { parsePagination } = require("../utils/pagination");
const { getDistanceKm } = require("../utils/geo");

const router = express.Router();

// Cache TTLs (seconds)
const TTL = {
    STOP_LIST:   120,
    STOP_NEARBY:  30,
    STOP_DETAIL: 300,
    STOP_BUSES:   10,  // approaching buses + ETAs — near real-time
};

/**
 * @route   GET /api/stops
 * @desc    Get a list of stops with optional filters (city, rtc) and pagination.
 * @access  Private
 * @param   {string} [req.query.city] - Filter by city
 * @param   {string|string[]} [req.query.rtc] - Filter by RTC operator
 * @param   {number} [req.query.page] - Pagination page number
 * @param   {number} [req.query.limit] - Pagination limit per page
 */
router.get("/", async (req, res) => {
    try {
        const { city, rtc } = req.query;
        const { page, limit, skip } = parsePagination(req.query);

        const cacheKey = `stops:list:${stableQueryString(req.query)}`;

        const result = await getOrSet(cacheKey, TTL.STOP_LIST, async () => {
            const filter = {};
            if (city) filter.city = city;
            if (rtc)  filter.rtc = { $in: Array.isArray(rtc) ? rtc : [rtc] };

            const [total, stops] = await Promise.all([
                Stop.countDocuments(filter),
                Stop.find(filter).skip(skip).limit(limit).lean()
            ]);

            return {
                pagination: {
                    total, page, limit,
                    totalPages:  Math.ceil(total / limit),
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1
                },
                stops
            };
        });

        res.status(200).json({ message: "Stops fetched successfully", ...result });
    } catch (error) {
        console.error("Error fetching stops:", error);
        res.status(500).json({ message: "Server error while fetching stops." });
    }
});

/**
 * @route   GET /api/stops/nearby
 * @desc    Get stops near a specific geographical point.
 * @access  Private
 * @param   {number} req.query.longitude - Longitude of center point
 * @param   {number} req.query.latitude - Latitude of center point
 * @param   {number} [req.query.radius] - Search radius in meters (default 5000)
 */
router.get("/nearby", async (req, res) => {
    try {
        const { longitude, latitude, radius } = req.query;

        if (!longitude || !latitude) {
            return res.status(400).json({ message: "Please provide both longitude and latitude query parameters." });
        }

        const parsedLng = parseFloat(longitude);
        const parsedLat = parseFloat(latitude);

        if (isNaN(parsedLng) || isNaN(parsedLat)) {
            return res.status(400).json({ message: "'longitude' and 'latitude' must be valid numbers." });
        }
        if (parsedLat < -90 || parsedLat > 90) {
            return res.status(400).json({ message: "'latitude' must be between -90 and 90." });
        }
        if (parsedLng < -180 || parsedLng > 180) {
            return res.status(400).json({ message: "'longitude' must be between -180 and 180." });
        }

        const parsedRadius = radius ? parseInt(radius, 10) : 5000;
        if (isNaN(parsedRadius) || parsedRadius <= 0) {
            return res.status(400).json({ message: "'radius' must be a positive integer (metres)." });
        }

        const cacheKey = `stops:nearby:${parsedLng}:${parsedLat}:${parsedRadius}`;

        const stops = await getOrSet(cacheKey, TTL.STOP_NEARBY, () =>
            Stop.find({
                location: {
                    $near: {
                        $geometry: { type: "Point", coordinates: [parsedLng, parsedLat] },
                        $maxDistance: parsedRadius
                    }
                }
            }).lean()
        );

        res.status(200).json({ message: "Nearby stops fetched successfully", count: stops.length, stops });
    } catch (error) {
        console.error("Error fetching nearby stops:", error);
        res.status(500).json({ message: "Server error while fetching nearby stops.", error: error.message });
    }
});

/**
 * @route   GET /api/stops/:stopId
 * @desc    Get details of a specific stop.
 * @access  Private
 * @param   {string} req.params.stopId - Stop ID (Path)
 */
router.get("/:stopId", async (req, res) => {
    try {
        const { stopId } = req.params;

        if (!mongoose.isValidObjectId(stopId)) {
            return res.status(400).json({ message: "Validation Error: 'stopId' is not a valid ObjectId" });
        }

        const stop = await getOrSet(`stops:detail:${stopId}`, TTL.STOP_DETAIL, () =>
            Stop.findById(stopId).lean()
        );

        if (!stop) return res.status(404).json({ message: "Stop not found" });
        res.status(200).json({ message: "Stop fetched successfully", stop });
    } catch (error) {
        console.error("Error fetching stop:", error);
        res.status(500).json({ message: "Server error while fetching stop." });
    }
});

/**
 * @route   POST /api/stops
 * @desc    Create a new stop.
 * @access  Private (Admin)
 * @param   {string} req.body.name - Stop name
 * @param   {string} req.body.city - City
 * @param   {string} req.body.state - State
 * @param   {string[]} req.body.rtc - Array of RTC operators
 * @param   {object} [req.body.location] - GeoJSON location object { coordinates: [lng, lat] }
 * @param   {number} [req.body.latitude] - Latitude (alternative to location object)
 * @param   {number} [req.body.longitude] - Longitude (alternative to location object)
 * @param   {boolean} [req.body.isActive] - Active status
 */
router.post("/", requireRole("admin"), async (req, res) => {
    try {

        const { name, city, state, rtc, location, latitude, longitude, isActive } = req.body;

        if (!name || !city || !state || !rtc) {
            return res.status(400).json({ message: "Missing required fields: name, city, state, rtc" });
        }
        if (!Array.isArray(rtc) || rtc.length === 0) {
            return res.status(400).json({ message: "Validation Error: 'rtc' must be a non-empty array (e.g. ['GSRTC'])" });
        }

        let stopLocation;
        if (location && location.coordinates) {
            stopLocation = { type: 'Point', coordinates: location.coordinates };
        } else if (longitude !== undefined && latitude !== undefined) {
            const parsedLng = parseFloat(longitude);
            const parsedLat = parseFloat(latitude);
            if (isNaN(parsedLng) || isNaN(parsedLat)) {
                return res.status(400).json({ message: "Validation Error: 'latitude' and 'longitude' must be valid numbers" });
            }
            if (parsedLat < -90 || parsedLat > 90) {
                return res.status(400).json({ message: "Validation Error: 'latitude' must be between -90 and 90" });
            }
            if (parsedLng < -180 || parsedLng > 180) {
                return res.status(400).json({ message: "Validation Error: 'longitude' must be between -180 and 180" });
            }
            stopLocation = { type: 'Point', coordinates: [parsedLng, parsedLat] };
        } else {
            return res.status(400).json({ message: "Missing required fields: location or latitude/longitude" });
        }

        const newStop = new Stop({
            name, city, state, rtc,
            location: stopLocation,
            isActive: isActive !== undefined ? isActive : true
        });

        await newStop.save();
        await invalidate("stops:list:*", "stops:nearby:*");

        res.status(201).json({ message: "Stop created successfully", stop: newStop });
    } catch (error) {
        console.error("Error creating stop:", error);
        res.status(500).json({ message: "Server error while creating stop.", error: error.message });
    }
});

/**
 * @route   PATCH /api/stops/:stopId
 * @desc    Update an existing stop.
 * @access  Private (Admin)
 * @param   {string} req.params.stopId - Stop ID (Path)
 * @param   {string} [req.body.name] - Stop name
 * @param   {string} [req.body.city] - City
 * @param   {string} [req.body.state] - State
 * @param   {string[]} [req.body.rtc] - Array of RTC operators
 * @param   {object} [req.body.location] - GeoJSON location object { coordinates: [lng, lat] }
 * @param   {number} [req.body.latitude] - Latitude (alternative to location object)
 * @param   {number} [req.body.longitude] - Longitude (alternative to location object)
 * @param   {boolean} [req.body.isActive] - Active status
 */
router.patch("/:stopId", requireRole("admin"), async (req, res) => {
    try {

        const { stopId } = req.params;
        const { name, city, state, rtc, location, latitude, longitude, isActive } = req.body;

        const updateData = {};
        if (name     !== undefined) updateData.name     = name;
        if (city     !== undefined) updateData.city     = city;
        if (state    !== undefined) updateData.state    = state;
        if (isActive !== undefined) updateData.isActive = isActive;

        if (rtc !== undefined) {
            if (!Array.isArray(rtc) || rtc.length === 0) {
                return res.status(400).json({ message: "Validation Error: 'rtc' must be a non-empty array" });
            }
            updateData.rtc = rtc;
        }

        if (location && location.coordinates) {
            if (!Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
                return res.status(400).json({ message: "Validation Error: 'location.coordinates' must be a [lng, lat] array" });
            }
            updateData.location = { type: 'Point', coordinates: location.coordinates };
        } else if (longitude !== undefined && latitude !== undefined) {
            const parsedLng = parseFloat(longitude);
            const parsedLat = parseFloat(latitude);
            if (isNaN(parsedLng) || isNaN(parsedLat)) {
                return res.status(400).json({ message: "Validation Error: 'latitude' and 'longitude' must be valid numbers" });
            }
            if (parsedLat < -90 || parsedLat > 90) {
                return res.status(400).json({ message: "Validation Error: 'latitude' must be between -90 and 90" });
            }
            if (parsedLng < -180 || parsedLng > 180) {
                return res.status(400).json({ message: "Validation Error: 'longitude' must be between -180 and 180" });
            }
            updateData.location = { type: 'Point', coordinates: [parsedLng, parsedLat] };
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: "No fields provided for update." });
        }

        const updatedStop = await Stop.findByIdAndUpdate(
            stopId,
            { $set: updateData },
            { returnDocument: "after", runValidators: true }
        );

        if (!updatedStop) return res.status(404).json({ message: "Stop not found" });

        await invalidate(
            `stops:detail:${stopId}`,
            `stops:buses:${stopId}`,
            "stops:list:*",
            "stops:nearby:*"
        );

        res.status(200).json({ message: "Stop updated successfully", stop: updatedStop });
    } catch (error) {
        console.error("Error updating stop:", error);
        res.status(500).json({ message: "Server error while updating stop.", error: error.message });
    }
});

/**
 * @route   DELETE /api/stops/:stopId
 * @desc    Delete a stop.
 * @access  Private (Admin)
 * @param   {string} req.params.stopId - Stop ID (Path)
 */
router.delete("/:stopId", requireRole("admin"), async (req, res) => {
    try {

        const { stopId } = req.params;
        if (!mongoose.isValidObjectId(stopId)) {
            return res.status(400).json({ message: "Validation Error: 'stopId' is not a valid ObjectId" });
        }
        const deletedStop = await Stop.findByIdAndDelete(stopId);

        if (!deletedStop) return res.status(404).json({ message: "Stop not found" });

        await invalidate(
            `stops:detail:${stopId}`,
            `stops:buses:${stopId}`,
            "stops:list:*",
            "stops:nearby:*"
        );

        res.status(200).json({ message: "Stop deleted successfully", stop: deletedStop });
    } catch (error) {
        console.error("Error deleting stop:", error);
        res.status(500).json({ message: "Server error while deleting stop.", error: error.message });
    }
});


/**
 * @route   GET /api/stops/:stopId/buses
 * @desc    Get approaching buses and ETAs for a specific stop.
 * @access  Private
 * @param   {string} req.params.stopId - Stop ID (Path)
 */
router.get("/:stopId/buses", async (req, res) => {
    try {
        const { stopId } = req.params;

        const result = await getOrSet(`stops:buses:${stopId}`, TTL.STOP_BUSES, async () => {
            const stop = await Stop.findById(stopId, { _id: 1, name: 1, location: 1 }).lean();
            if (!stop) return null;

            if (!stop.location?.coordinates?.length) {
                return { noLocation: true, stop };
            }

            const [stopLng, stopLat] = stop.location.coordinates;

            const routes = await Route.find(
                { stopIds: stopId, isActive: true },
                { _id: 1 }
            ).lean();

            if (routes.length === 0) {
                return {
                    stop: { _id: stop._id, name: stop.name },
                    count: 0,
                    buses: []
                };
            }

            const routeIds = routes.map(r => r._id);
            const buses = await Bus.find(
                {
                    routeId: { $in: routeIds },
                    isActive: true,
                    "lastKnownLocation.coordinates": { $exists: true, $ne: [] }
                },
                { _id: 1, routeName: 1, rtc: 1, routeId: 1, lastKnownLocation: 1 }
            ).lean();

            const FALLBACK_SPEED_KMH = 40;
            const busesWithEta = buses.map(bus => {
                const loc = bus.lastKnownLocation;
                const [busLng, busLat] = loc.coordinates;
                const distanceKm = getDistanceKm(busLat, busLng, stopLat, stopLng);
                const speedKmh = (loc.speed_kmh && loc.speed_kmh > 0) ? loc.speed_kmh : FALLBACK_SPEED_KMH;
                const etaMinutes = Math.round((distanceKm / speedKmh) * 60);
                return {
                    _id: bus._id,
                    routeName: bus.routeName,
                    rtc: bus.rtc,
                    routeId: bus.routeId,
                    lastKnownLocation: loc,
                    distance_km: parseFloat(distanceKm.toFixed(2)),
                    speed_kmh: speedKmh,
                    eta_minutes: etaMinutes
                };
            });

            return {
                stop: { _id: stop._id, name: stop.name },
                count: busesWithEta.length,
                buses: busesWithEta
            };
        });

        if (!result) return res.status(404).json({ message: "Stop not found" });

        if (result.noLocation) {
            return res.status(409).json({
                message: "Stop has no location data — cannot calculate ETAs"
            });
        }

        return res.status(200).json({ message: "Buses fetched successfully", ...result });
    } catch (error) {
        console.error("Error fetching buses for stop:", error);
        res.status(500).json({ message: "Server error while fetching buses for stop", error: error.message });
    }
});

module.exports = router;
