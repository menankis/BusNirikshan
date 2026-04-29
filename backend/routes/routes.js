const express = require("express");
const mongoose = require("mongoose");
const authMiddleware = require("../middleware/authorise");
const Route = require("../models/route");
const Bus = require("../models/bus");
const router = express.Router();

// Shared pagination helper
function parsePagination(query, defaultLimit = 20, maxLimit = 100) {
    const page  = Math.max(1, parseInt(query.page,  10) || 1);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
    const skip  = (page - 1) * limit;
    return { page, limit, skip };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/routes
// List routes with optional filters.
//
// Auth:    None required (public)
// Query:   rtc?      — filter by operator (GSRTC | MSRTC | RSRTC), repeatable
//          isActive? — "true" | "false"
//          stopId?   — only routes that include this stop
//          page?     — pagination page number
//          limit?    — items per page
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const { rtc, isActive, stopId } = req.query;
        const { page, limit, skip } = parsePagination(req.query);

        const filter = {};

        // ── RTC filter ───────────────────────────────────────────────────────
        if (rtc) {
            const rtcArray = Array.isArray(rtc) ? rtc : [rtc];
            filter.rtc = { $in: rtcArray };
        }

        // ── isActive filter ──────────────────────────────────────────────────
        if (isActive !== undefined) {
            if (isActive !== "true" && isActive !== "false") {
                return res.status(400).json({
                    message: "Validation Error: 'isActive' must be 'true' or 'false'"
                });
            }
            filter.isActive = isActive === "true";
        }

        // ── Stop filter ──────────────────────────────────────────────────────
        // Uses the multikey index on stopIds — no full scan needed
        if (stopId) {
            if (!mongoose.isValidObjectId(stopId)) {
                return res.status(400).json({
                    message: "Validation Error: 'stopId' is not a valid ObjectId"
                });
            }
            filter.stopIds = stopId;
        }

        // ── Query ────────────────────────────────────────────────────────────
        const [total, routes] = await Promise.all([
            Route.countDocuments(filter),
            Route.find(filter).skip(skip).limit(limit).lean()
        ]);

        return res.status(200).json({
            message: "Routes fetched successfully",
            pagination: {
                total,
                page,
                limit,
                totalPages:  Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1
            },
            routes
        });

    } catch (error) {
        console.error("Error fetching routes:", error);
        res.status(500).json({
            message: "Server error while fetching routes",
            error: error.message
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/routes/:routeId
// Fetch a single route by its _id.
//
// Auth:    None required (public)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:routeId", async (req, res) => {
    try {
        const { routeId } = req.params;

        const route = await Route.findById(routeId);

        if (!route) {
            return res.status(404).json({ message: "Route not found" });
        }

        return res.status(200).json({
            message: "Route fetched successfully",
            route
        });

    } catch (error) {
        console.error("Error fetching route:", error);
        res.status(500).json({
            message: "Server error while fetching route",
            error: error.message
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/routes
// Create a new route. Admin only.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Only admins can create routes" });
        }

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
            name,
            rtc,
            stopIds: stopIds ?? [],
            totalDistanceKm,
            estimatedDurationMin,
            isActive: isActive !== undefined ? isActive : true
        });

        await newRoute.save();

        return res.status(201).json({
            message: "Route created successfully",
            route: newRoute
        });

    } catch (error) {
        console.error("Error creating route:", error);
        if (error.code === 11000) {
            return res.status(400).json({
                message: "A route with this name already exists for the given RTC"
            });
        }
        res.status(500).json({
            message: "Server error while creating route",
            error: error.message
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/routes/:routeId
// Partially update a route. Admin only.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:routeId", authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Only admins can update routes" });
        }

        const { routeId } = req.params;
        const { name, rtc, stopIds, totalDistanceKm, estimatedDurationMin, isActive } = req.body;

        const updateData = {};

        if (name              !== undefined) updateData.name               = name;
        if (totalDistanceKm   !== undefined) updateData.totalDistanceKm    = totalDistanceKm;
        if (estimatedDurationMin !== undefined) updateData.estimatedDurationMin = estimatedDurationMin;
        if (isActive          !== undefined) updateData.isActive            = isActive;

        if (rtc !== undefined) {
            updateData.rtc = rtc;
        }

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

        if (!updatedRoute) {
            return res.status(404).json({ message: "Route not found" });
        }

        return res.status(200).json({
            message: "Route updated successfully",
            route: updatedRoute
        });

    } catch (error) {
        console.error("Error updating route:", error);
        if (error.code === 11000) {
            return res.status(400).json({
                message: "A route with this name already exists for the given RTC"
            });
        }
        res.status(500).json({
            message: "Server error while updating route",
            error: error.message
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/routes/:routeId
// Delete a route. Admin only.
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:routeId", authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Only admins can delete routes" });
        }

        const { routeId } = req.params;

        const deletedRoute = await Route.findByIdAndDelete(routeId);

        if (!deletedRoute) {
            return res.status(404).json({ message: "Route not found" });
        }

        return res.status(200).json({
            message: "Route deleted successfully",
            route: deletedRoute
        });

    } catch (error) {
        console.error("Error deleting route:", error);
        res.status(500).json({
            message: "Server error while deleting route",
            error: error.message
        });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/routes/:routeId/buses
// Get all active buses currently running on a route.
// Query:   page?, limit?
// Auth:    None required (public)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:routeId/buses", async (req, res) => {
    try {
        const { routeId } = req.params;

        if (!mongoose.isValidObjectId(routeId)) {
            return res.status(400).json({
                message: "Validation Error: 'routeId' is not a valid ObjectId"
            });
        }

        const { page, limit, skip } = parsePagination(req.query);


        const busFilter = { routeId, isActive: true };

        const [total, buses] = await Promise.all([
            Bus.countDocuments(busFilter),
            Bus.find(
                busFilter,
                { _id: 1, routeName: 1, rtc: 1, registrationNumber: 1, lastKnownLocation: 1 }
            ).skip(skip).limit(limit).lean()
        ]);

        return res.status(200).json({
            message: "Buses fetched successfully",
            pagination: {
                total,
                page,
                limit,
                totalPages:  Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1
            },
            buses
        });

    } catch (error) {
        console.error("Error fetching buses for route:", error);
        res.status(500).json({
            message: "Server error while fetching buses for route",
            error: error.message
        });
    }
});

module.exports = router;