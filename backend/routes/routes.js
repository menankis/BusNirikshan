const express = require("express");
const mongoose = require("mongoose");
const requireRole = require("../middleware/requireRole");
const Route = require("../models/route");
const Bus = require("../models/bus");
const { getOrSet, invalidate, stableQueryString } = require("../utils/cache");
const { parsePagination } = require("../utils/pagination");

const router = express.Router();



// Cache TTLs (seconds)
const TTL = {
    ROUTE_LIST:   60,
    ROUTE_DETAIL: 120,
    ROUTE_BUSES:  20,
};

/**
 * @route   GET /api/routes
 * @desc    Get a list of routes with optional filters (rtc, isActive, stopId) and pagination.
 * @access  Private
 * @param   {string|string[]} [req.query.rtc] - Filter by RTC operator
 * @param   {boolean|string} [req.query.isActive] - Filter by active status
 * @param   {string} [req.query.stopId] - Filter by Stop ID
 * @param   {number} [req.query.page] - Pagination page number
 * @param   {number} [req.query.limit] - Pagination limit per page
 */
router.get("/", async (req, res) => {
    try {
        const { rtc, isActive, stopId } = req.query;
        const { page, limit, skip } = parsePagination(req.query);

        // Validate isActive before cache lookup so errors never get cached
        if (isActive !== undefined && isActive !== "true" && isActive !== "false") {
            return res.status(400).json({
                message: "Validation Error: 'isActive' must be 'true' or 'false'"
            });
        }
        if (stopId && !mongoose.isValidObjectId(stopId)) {
            return res.status(400).json({
                message: "Validation Error: 'stopId' is not a valid ObjectId"
            });
        }

        const cacheKey = `routes:list:${stableQueryString(req.query)}`;

        const result = await getOrSet(cacheKey, TTL.ROUTE_LIST, async () => {
            const filter = {};

            if (rtc) filter.rtc = { $in: Array.isArray(rtc) ? rtc : [rtc] };
            if (isActive !== undefined) filter.isActive = isActive === "true";
            if (stopId) filter.stopIds = stopId;

            const [total, routes] = await Promise.all([
                Route.countDocuments(filter),
                Route.find(filter).skip(skip).limit(limit).lean()
            ]);

            return {
                pagination: {
                    total, page, limit,
                    totalPages:  Math.ceil(total / limit),
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1
                },
                routes
            };
        });

        return res.status(200).json({ message: "Routes fetched successfully", ...result });
    } catch (error) {
        console.error("Error fetching routes:", error);
        res.status(500).json({ message: "Server error while fetching routes", error: error.message });
    }
});

/**
 * @route   GET /api/routes/:routeId
 * @desc    Get details of a specific route.
 * @access  Private
 * @param   {string} req.params.routeId - Route ID (Path)
 */
router.get("/:routeId", async (req, res) => {
    try {
        const { routeId } = req.params;

        if (!mongoose.isValidObjectId(routeId)) {
            return res.status(400).json({ message: "Validation Error: 'routeId' is not a valid ObjectId" });
        }
        const route = await getOrSet(`routes:detail:${routeId}`, TTL.ROUTE_DETAIL, () =>
            Route.findById(routeId)
        );

        if (!route) return res.status(404).json({ message: "Route not found" });

        return res.status(200).json({ message: "Route fetched successfully", route });
    } catch (error) {
        console.error("Error fetching route:", error);
        res.status(500).json({ message: "Server error while fetching route", error: error.message });
    }
});

/**
 * @route   POST /api/routes
 * @desc    Create a new route.
 * @access  Private (Admin)
 * @param   {string} req.body.name - Route name
 * @param   {string} req.body.rtc - RTC operator
 * @param   {string[]} [req.body.stopIds] - Array of Stop IDs
 * @param   {number} req.body.totalDistanceKm - Total distance in km
 * @param   {number} req.body.estimatedDurationMin - Estimated duration in minutes
 * @param   {boolean} [req.body.isActive] - Active status
 */
router.post("/", requireRole("admin"), async (req, res) => {
    try {

        const { name, rtc, stopIds, totalDistanceKm, estimatedDurationMin, isActive } = req.body;

        if (!name || !rtc || !totalDistanceKm || !estimatedDurationMin) {
            return res.status(400).json({
                message: "Missing required fields: name, rtc, totalDistanceKm, estimatedDurationMin"
            });
        }

        if (stopIds !== undefined && !Array.isArray(stopIds)) {
            return res.status(400).json({ message: "Validation Error: 'stopIds' must be an array" });
        }

        const newRoute = new Route({
            name, rtc,
            stopIds: stopIds ?? [],
            totalDistanceKm, estimatedDurationMin,
            isActive: isActive !== undefined ? isActive : true
        });

        await newRoute.save();
        await invalidate("routes:list:*");

        return res.status(201).json({ message: "Route created successfully", route: newRoute });
    } catch (error) {
        console.error("Error creating route:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: "A route with this name already exists for the given RTC" });
        }
        res.status(500).json({ message: "Server error while creating route", error: error.message });
    }
});

/**
 * @route   PATCH /api/routes/:routeId
 * @desc    Update an existing route.
 * @access  Private (Admin)
 * @param   {string} req.params.routeId - Route ID (Path)
 * @param   {string} [req.body.name] - Route name
 * @param   {string} [req.body.rtc] - RTC operator
 * @param   {string[]} [req.body.stopIds] - Array of Stop IDs
 * @param   {number} [req.body.totalDistanceKm] - Total distance in km
 * @param   {number} [req.body.estimatedDurationMin] - Estimated duration in minutes
 * @param   {boolean} [req.body.isActive] - Active status
 */
router.patch("/:routeId", requireRole("admin"), async (req, res) => {
    try {

        const { routeId } = req.params;
        const { name, rtc, stopIds, totalDistanceKm, estimatedDurationMin, isActive } = req.body;

        const updateData = {};
        if (name              !== undefined) updateData.name               = name;
        if (totalDistanceKm   !== undefined) updateData.totalDistanceKm    = totalDistanceKm;
        if (estimatedDurationMin !== undefined) updateData.estimatedDurationMin = estimatedDurationMin;
        if (isActive          !== undefined) updateData.isActive            = isActive;
        if (rtc               !== undefined) updateData.rtc                 = rtc;

        if (stopIds !== undefined) {
            if (!Array.isArray(stopIds)) {
                return res.status(400).json({ message: "Validation Error: 'stopIds' must be an array" });
            }
            updateData.stopIds = stopIds;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: "No fields provided for update" });
        }

        const updatedRoute = await Route.findByIdAndUpdate(
            routeId,
            { $set: updateData },
            { returnDocument: "after", runValidators: true }
        );

        if (!updatedRoute) return res.status(404).json({ message: "Route not found" });

        await invalidate(
            `routes:detail:${routeId}`,
            `routes:buses:${routeId}:*`,
            "routes:list:*"
        );

        return res.status(200).json({ message: "Route updated successfully", route: updatedRoute });
    } catch (error) {
        console.error("Error updating route:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: "A route with this name already exists for the given RTC" });
        }
        res.status(500).json({ message: "Server error while updating route", error: error.message });
    }
});

/**
 * @route   DELETE /api/routes/:routeId
 * @desc    Delete a route.
 * @access  Private (Admin)
 * @param   {string} req.params.routeId - Route ID (Path)
 */
router.delete("/:routeId", requireRole("admin"), async (req, res) => {
    try {
        const { routeId } = req.params;
        if (!mongoose.isValidObjectId(routeId)) {
            return res.status(400).json({ message: "Validation Error: 'routeId' is not a valid ObjectId" });
        }
        const deletedRoute = await Route.findByIdAndDelete(routeId);

        if (!deletedRoute) return res.status(404).json({ message: "Route not found" });

        await invalidate(
            `routes:detail:${routeId}`,
            `routes:buses:${routeId}:*`,
            "routes:list:*"
        );

        return res.status(200).json({ message: "Route deleted successfully", route: deletedRoute });
    } catch (error) {
        console.error("Error deleting route:", error);
        res.status(500).json({ message: "Server error while deleting route", error: error.message });
    }
});

/**
 * @route   GET /api/routes/:routeId/buses
 * @desc    Get active buses currently on a specific route.
 * @access  Private
 * @param   {string} req.params.routeId - Route ID (Path)
 * @param   {number} [req.query.page] - Pagination page number
 * @param   {number} [req.query.limit] - Pagination limit per page
 */
router.get("/:routeId/buses", async (req, res) => {
    try {
        const { routeId } = req.params;

        if (!mongoose.isValidObjectId(routeId)) {
            return res.status(400).json({
                message: "Validation Error: 'routeId' is not a valid ObjectId"
            });
        }

        const { page, limit, skip } = parsePagination(req.query);
        const cacheKey = `routes:buses:${routeId}:${stableQueryString({ page, limit })}`;

        const result = await getOrSet(cacheKey, TTL.ROUTE_BUSES, async () => {
            const busFilter = { routeId, isActive: true };
            const [total, buses] = await Promise.all([
                Bus.countDocuments(busFilter),
                Bus.find(busFilter, {
                    _id: 1, routeName: 1, rtc: 1, registrationNumber: 1, lastKnownLocation: 1
                }).skip(skip).limit(limit).lean()
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

        return res.status(200).json({ message: "Buses fetched successfully", ...result });
    } catch (error) {
        console.error("Error fetching buses for route:", error);
        res.status(500).json({ message: "Server error while fetching buses for route", error: error.message });
    }
});

module.exports = router;