const mongoose = require("mongoose");
const requireRole = require("../middleware/requireRole");
const Bus = require("../models/bus");
const BusLocation = require("../models/buslocation");
const Stop = require("../models/stop");
const express = require("express");
const { getOrSet, invalidate, stableQueryString } = require("../utils/cache");
const { parsePagination } = require("../utils/pagination");
const { getDistanceKm } = require("../utils/geo");

const router = express.Router();

// Cache TTLs (seconds)
const TTL = {
    BUS_LIST:    30,
    BUS_DETAIL:  60,
    BUS_STATUS:   5,
    BUS_ETA:     10,
    BUS_HISTORY: 120,
};

// GET /api/buses
// Cache key encodes ALL query params (rtc, isActive, page, limit) so each
// page/filter combination is stored as a separate entry.
router.get("/", async (req, res) => {
    try {
        const { rtc, isActive } = req.query;
        const { page, limit, skip } = parsePagination(req.query);

        if (isActive !== undefined && isActive !== 'true' && isActive !== 'false') {
            return res.status(400).json({
                message: "Validation Error: 'isActive' must be 'true' or 'false'"
            });
        }

        const cacheKey = `buses:list:${stableQueryString(req.query)}`;

        const result = await getOrSet(cacheKey, TTL.BUS_LIST, async () => {
            const filter = {};
            if (rtc) filter.rtc = { $in: Array.isArray(rtc) ? rtc : [rtc] };
            if (isActive !== undefined) filter.isActive = isActive === 'true';

            const [total, buses] = await Promise.all([
                Bus.countDocuments(filter),
                Bus.find(filter).skip(skip).limit(limit).lean()
            ]);

            return {
                pagination: {
                    total, page, limit,
                    totalPages:  Math.ceil(total / limit),
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1
                },
                buses
            };
        });

        res.status(200).json({ message: "Buses fetched successfully", ...result });
    } catch (error) {
        console.error("Error fetching buses:", error);
        res.status(500).json({ message: "Server error while fetching buses." });
    }
});

// GET /api/buses/:busId
router.get("/:busId", async (req, res) => {
    try {
        const { busId } = req.params;
        if (!mongoose.isValidObjectId(busId)) {
            return res.status(400).json({ message: "Validation Error: 'busId' is not a valid ObjectId" });
        }
        
        const bus = await getOrSet(`buses:detail:${busId}`, TTL.BUS_DETAIL, () =>
            Bus.findById(busId).lean()
        );

        if (!bus) return res.status(404).json({ message: "Bus not found" });
        res.status(200).json({ message: "Bus fetched successfully", bus });
    } catch (error) {
        console.error("Error fetching bus:", error);
        res.status(500).json({ message: "Server error while fetching bus." });
    }
});

// POST /api/buses — admin only
// Invalidates all list pages (new bus shifts pagination for every page)
router.post("/", requireRole("admin"), async (req, res) => {
    try {

        const { routeId, rtc, routeName, registrationNumber, capacity, isActive } = req.body;

        if (!routeId || !rtc || !routeName || !registrationNumber || capacity === undefined || capacity === null) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        if (!mongoose.isValidObjectId(routeId)) {
            return res.status(400).json({ message: "Validation Error: 'routeId' is not a valid ObjectId" });
        }

        const existingBus = await Bus.findOne({ registrationNumber });
        if (existingBus) {
            return res.status(400).json({ message: "Bus with this Registration Number already exists" });
        }

        const newBus = new Bus({
            routeId, rtc, routeName, registrationNumber, capacity,
            isActive: isActive !== undefined ? isActive : false
        });

        await newBus.save();
        await invalidate("buses:list:*", `routes:buses:${routeId}:*`);

        res.status(201).json({ message: "Bus created successfully", bus: newBus });
    } catch (error) {
        console.error("Error creating bus:", error);
        res.status(500).json({ message: "Server error while creating bus.", error: error.message });
    }
});

// PATCH /api/buses/:busId — admin only
// Invalidates detail, status, eta, and ALL list pages
router.patch("/:busId", requireRole("admin"), async (req, res) => {
    try {

        const { busId } = req.params;
        if (!mongoose.isValidObjectId(busId)) {
            return res.status(400).json({ message: "Validation Error: 'busId' is not a valid ObjectId" });
        }

        const {
            routeId, rtc, routeName, registrationNumber, capacity,
            isActive, location, latitude, longitude,
            speed_kmh, heading_deg
        } = req.body;

        const updateData = {};
        if (routeId !== undefined)             updateData.routeId = routeId;
        if (rtc !== undefined)                 updateData.rtc = rtc;
        if (routeName !== undefined)           updateData.routeName = routeName;
        if (registrationNumber !== undefined)  updateData.registrationNumber = registrationNumber;
        if (capacity !== undefined)            updateData.capacity = capacity;
        if (isActive !== undefined)            updateData.isActive = isActive;

        if (location && location.coordinates) {
            if (!Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
                return res.status(400).json({ message: "Validation Error: 'location.coordinates' must be a [lng, lat] array" });
            }
            updateData.lastKnownLocation = {
                type: 'Point', coordinates: location.coordinates,
                ...(speed_kmh !== undefined && { speed_kmh }),
                ...(heading_deg !== undefined && { heading_deg }),
                recordedAt: new Date()
            };
        } else if (longitude !== undefined && latitude !== undefined) {
            const parsedLng = parseFloat(longitude);
            const parsedLat = parseFloat(latitude);
            if (isNaN(parsedLng) || isNaN(parsedLat)) {
                return res.status(400).json({ message: "Validation Error: 'latitude' and 'longitude' must be valid numbers" });
            }
            updateData.lastKnownLocation = {
                type: 'Point', coordinates: [parsedLng, parsedLat],
                ...(speed_kmh !== undefined && { speed_kmh }),
                ...(heading_deg !== undefined && { heading_deg }),
                recordedAt: new Date()
            };
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: "No fields provided for update." });
        }

        const updatedBus = await Bus.findByIdAndUpdate(
            busId,
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );

        if (!updatedBus) return res.status(404).json({ message: "Bus not found" });

        await invalidate(
            `buses:detail:${busId}`,
            `buses:status:${busId}`,
            `buses:eta:${busId}:*`,
            "buses:list:*",
            `routes:buses:${updatedBus.routeId}:*`
        );

        res.status(200).json({ message: "Bus updated successfully", bus: updatedBus });
    } catch (error) {
        console.error("Error updating bus:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: "Bus with this Registration Number already exists." });
        }
        res.status(500).json({ message: "Server error while updating bus.", error: error.message });
    }
});

// DELETE /api/buses/:busId — admin only
router.delete("/:busId", requireRole("admin"), async (req, res) => {
    try {

        const { busId } = req.params;
        if (!mongoose.isValidObjectId(busId)) {
            return res.status(400).json({ message: "Validation Error: 'busId' is not a valid ObjectId" });
        }

        const deletedBus = await Bus.findByIdAndDelete(busId);

        if (!deletedBus) return res.status(404).json({ message: "Bus not found" });

        await invalidate(
            `buses:detail:${busId}`,
            `buses:status:${busId}`,
            `buses:eta:${busId}:*`,
            "buses:list:*",
            `routes:buses:${deletedBus.routeId}:*`
        );

        res.status(200).json({ message: "Bus deleted successfully", bus: deletedBus });
    } catch (error) {
        console.error("Error deleting bus:", error);
        res.status(500).json({ message: "Server error while deleting bus.", error: error.message });
    }
});

// GET /api/buses/:busId/status  — TTL 5 s (near real-time)
router.get("/:busId/status", async (req, res) => {
    try {
        const { busId } = req.params;
        if (!mongoose.isValidObjectId(busId)) {
            return res.status(400).json({ message: "Validation Error: 'busId' is not a valid ObjectId" });
        }

        const status = await getOrSet(`buses:status:${busId}`, TTL.BUS_STATUS, async () => {
            const bus = await Bus.findById(busId, 'isActive lastKnownLocation');
            if (!bus) return null;
            return { isActive: bus.isActive, lastKnownLocation: bus.lastKnownLocation };
        });

        if (!status) return res.status(404).json({ message: "Bus not found" });
        res.status(200).json({ message: "Bus status fetched successfully", status });
    } catch (error) {
        console.error("Error fetching bus status:", error);
        res.status(500).json({ message: "Server error while fetching bus status.", error: error.message });
    }
});

// GET /api/buses/:busId/history
// Cache key encodes busId + time window + page + limit so each page of a
// time-range query is stored independently.
router.get("/:busId/history", async (req, res) => {
    try {
        const { busId } = req.params;
        if (!mongoose.isValidObjectId(busId)) {
            return res.status(400).json({ message: "Validation Error: 'busId' is not a valid ObjectId" });
        }

        const { from, to } = req.query;
        const { page, limit, skip } = parsePagination(req.query, 100, 500);

        if (!from || !to) {
            return res.status(400).json({ message: "Both 'from' and 'to' epoch timestamps are required." });
        }

        const fromDate = new Date(parseInt(from));
        const toDate   = new Date(parseInt(to));

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return res.status(400).json({ message: "Invalid 'from' or 'to' timestamps provided." });
        }
        if (fromDate >= toDate) {
            return res.status(400).json({ message: "'from' must be earlier than 'to'." });
        }

        const cacheKey = `buses:history:${busId}:${from}:${to}:${stableQueryString({ page, limit })}`;

        const result = await getOrSet(cacheKey, TTL.BUS_HISTORY, async () => {
            const timeFilter = { busId, timestamp: { $gte: fromDate, $lte: toDate } };
            const [total, history] = await Promise.all([
                BusLocation.countDocuments(timeFilter),
                BusLocation.find(timeFilter).sort({ timestamp: 1 }).skip(skip).limit(limit).lean()
            ]);
            if (total === 0) return null;
            return {
                pagination: {
                    total, page, limit,
                    totalPages:  Math.ceil(total / limit),
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1
                },
                history
            };
        });

        if (!result) {
            return res.status(404).json({ message: "No history found for this bus in the given time range." });
        }

        res.status(200).json({ message: "Bus history fetched successfully", ...result });
    } catch (error) {
        console.error("Error fetching bus history:", error);
        res.status(500).json({ message: "Server error while fetching bus history.", error: error.message });
    }
});


// GET /api/buses/:busId/eta  — TTL 10 s
// Key: busId + stopId (no pagination — single calculation)
router.get("/:busId/eta", async (req, res) => {
    try {
        const { busId } = req.params;
        if (!mongoose.isValidObjectId(busId)) {
            return res.status(400).json({ message: "Validation Error: 'busId' is not a valid ObjectId" });
        }

        const { stopId } = req.query;
        if (!mongoose.isValidObjectId(stopId)) {
            return res.status(400).json({ message: "Validation Error: 'stopId' is not a valid ObjectId" });
        }

        const cacheKey = `buses:eta:${busId}:${stopId}`;

        const etaResult = await getOrSet(cacheKey, TTL.BUS_ETA, async () => {
            const [bus, stop] = await Promise.all([
                Bus.findById(busId, 'lastKnownLocation'),
                Stop.findById(stopId, 'location')
            ]);

            if (!bus)  return { error: "bus_not_found" };
            if (!stop) return { error: "stop_not_found" };

            // Fixed: correct operator precedence — !(x >= 2), not (!x) >= 2
            if (!(bus.lastKnownLocation?.coordinates?.length >= 2)) {
                return { error: "no_location" };
            }
            if (!(stop.location?.coordinates?.length >= 2)) {
                return { error: "invalid_stop" };
            }

            const [busLon, busLat]   = bus.lastKnownLocation.coordinates;
            const [stopLon, stopLat] = stop.location.coordinates;
            const distanceKm = getDistanceKm(busLat, busLon, stopLat, stopLon);
            let speedKmh = bus.lastKnownLocation.speed_kmh;
            if (!speedKmh || speedKmh <= 0) speedKmh = 40;
            const etaMinutes = Math.round((distanceKm / speedKmh) * 60);

            return {
                distance_km: parseFloat(distanceKm.toFixed(2)),
                speed_kmh: speedKmh,
                eta_minutes: etaMinutes
            };
        });

        if (!etaResult) return res.status(500).json({ message: "Could not calculate ETA." });

        if (etaResult.error === "bus_not_found")  return res.status(404).json({ message: "Bus not found" });
        if (etaResult.error === "stop_not_found") return res.status(404).json({ message: "Stop not found" });
        if (etaResult.error === "no_location")    return res.status(400).json({ message: "Bus location is currently unknown." });
        if (etaResult.error === "invalid_stop")   return res.status(400).json({ message: "Stop location is invalid." });

        res.status(200).json({ message: "ETA calculated successfully", ...etaResult });
    } catch (error) {
        console.error("Error calculating ETA:", error);
        res.status(500).json({ message: "Server error while calculating ETA.", error: error.message });
    }
});

module.exports = router;