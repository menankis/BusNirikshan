const express = require("express");
const mongoose = require("mongoose");
const authorise = require("../middleware/authorise");
const Driver = require("../models/driver");
const Bus = require("../models/bus");
const BusLocation = require("../models/buslocation");
const Shift = require("../models/shift");

const router = express.Router();

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

        // Optional fields
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

        // Resolve timestamp: accept ISO string / epoch ms from device, or default to now
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
        // The JWT carries userId (the User._id); we need the Driver document
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
        // The active shift is the most recent one with endedAt == null
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
        const [locationDoc] = await Promise.all([
            // 5a. BusLocation — append to the time-series log
            BusLocation.create({
                busId,
                timestamp: recordedAt,
                coordinates: {
                    lat: parsedLat,
                    lng: parsedLng
                },
                ...(parsedSpeed   !== undefined && { speed_kmh:   parsedSpeed }),
                ...(parsedHeading !== undefined && { heading_deg: parsedHeading }),
                driverId: driver._id
            }),

            // 5b. Bus — update the real-time GeoJSON snapshot
            //     GeoJSON uses [longitude, latitude] order
            Bus.findByIdAndUpdate(
                busId,
                {
                    $set: {
                        lastKnownLocation: {
                            type: "Point",
                            coordinates: [parsedLng, parsedLat],   // GeoJSON: [lng, lat]
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

        // ── 6. Success response ──────────────────────────────────────────────
        return res.status(201).json({
            message: "GPS location updated successfully",
            // location: {
            //     busId,
            //     driverId: driver._id,
            //     lat: parsedLat,
            //     lng: parsedLng,
            //     ...(parsedSpeed   !== undefined && { speed_kmh:   parsedSpeed }),
            //     ...(parsedHeading !== undefined && { heading_deg: parsedHeading }),
            //     recordedAt
            // }
        });

    } catch (error) {
        console.error("Error updating location:", error);
        res.status(500).json({
            message: "Server error while updating location",
            error: error.message
        });
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
//
// Geospatial note:
//   $nearSphere on the Bus.lastKnownLocation 2dsphere index sorts results by
//   distance (closest bus first) and is far more efficient than a full collection
//   scan. lat + lng are strongly recommended; omitting them returns ALL active
//   buses which can be very large on a national deployment.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/live", async (req, res) => {
    try {
        const { lat, lng, radius, rtc, routeId } = req.query;

        // ── Geospatial filter ────────────────────────────────────────────────
        const hasLat = lat !== undefined && lat !== null && lat !== "";
        const hasLng = lng !== undefined && lng !== null && lng !== "";

        if (hasLat !== hasLng) {
            return res.status(400).json({
                message: "Validation Error: 'lat' and 'lng' must be provided together"
            });
        }

        // Build filter: active buses that have a recorded location
        const filter = {
            isActive: true,
            "lastKnownLocation.coordinates": { $exists: true, $ne: [] }
        };

        if (hasLat && hasLng) {
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

            const MAX_RADIUS_KM = 100;
            const DEFAULT_RADIUS_KM = 10;

            let radiusKm = radius !== undefined ? parseFloat(radius) : DEFAULT_RADIUS_KM;

            if (isNaN(radiusKm) || radiusKm <= 0) {
                return res.status(400).json({
                    message: "Validation Error: 'radius' must be a positive number (km)"
                });
            }
            if (radiusKm > MAX_RADIUS_KM) {
                return res.status(400).json({
                    message: `Validation Error: 'radius' cannot exceed ${MAX_RADIUS_KM} km`
                });
            }

            // $nearSphere uses the 2dsphere index — results are sorted closest-first
            // Coordinates in GeoJSON order: [longitude, latitude]
            filter.lastKnownLocation = {
                $nearSphere: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parsedLng, parsedLat]
                    },
                    $maxDistance: radiusKm * 1000  // $nearSphere takes metres
                }
            };
        }

        // ── RTC filter ───────────────────────────────────────────────────────
        if (rtc) {
            const rtcArray = Array.isArray(rtc) ? rtc : [rtc];
            filter.rtc = { $in: rtcArray };
        }

        // ── Route filter ─────────────────────────────────────────────────────
        if (routeId) {
            if (!mongoose.isValidObjectId(routeId)) {
                return res.status(400).json({
                    message: "Validation Error: 'routeId' is not a valid ObjectId"
                });
            }
            filter.routeId = routeId;
        }

        // Lean projection — only fields the client needs for a live map
        // lastKnownLocation is returned as raw GeoJSON, matching the format
        // used by all other bus endpoints (e.g. GET /api/buses/:id)
        // Note: $nearSphere is incompatible with countDocuments, so full pagination
        // is not supported here. Use ?limit (default 50, max 200) to cap results.
        // Use ?radius to narrow the geographic scope instead.
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

        const buses = await Bus.find(filter, {
            _id: 1,
            routeName: 1,
            rtc: 1,
            routeId: 1,
            lastKnownLocation: 1
        }).limit(limit).lean();

        return res.status(200).json({
            message: "Live bus locations fetched successfully",
            limit,
            count: buses.length,
            buses
        });

    } catch (error) {
        console.error("Error fetching live locations:", error);
        res.status(500).json({
            message: "Server error while fetching live locations",
            error: error.message
        });
    }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/locations/live/:busId
// Returns the latest known position of a single bus.
//
// Auth:    None required (public endpoint)
// Params:  busId — the Bus _id (natural key, e.g. "GJ01-AB-1234")
// ─────────────────────────────────────────────────────────────────────────────
router.get("/live/:busId", async (req, res) => {
    const { busId } = req.params;
    try {
        const bus = await Bus.findById(busId, {
            _id: 1,
            routeName: 1,
            rtc: 1,
            routeId: 1,
            isActive: 1,
            lastKnownLocation: 1
        }).lean();

        if (!bus) {
            return res.status(404).json({ message: "Bus not found" });
        }

        if (!bus.lastKnownLocation || !bus.lastKnownLocation.coordinates?.length) {
            return res.status(409).json({
                message: "Bus location is not yet available — the bus may not have started its shift"
            });
        }

        return res.status(200).json({
            message: "Bus location fetched successfully",
            bus
        });

    } catch (error) {
        console.error("Error fetching bus location:", error);
        res.status(500).json({
            message: "Server error while fetching bus location",
            error: error.message
        });
    }
});

module.exports = router;