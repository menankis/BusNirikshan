const authorise = require("../middleware/authorise");
const Bus = require("../models/bus");
const BusLocation = require("../models/buslocation");
const Stop = require("../models/stop");
const express = require("express");

const router = express.Router();

router.get("/",async (req,res)=>{
    try {
        const { rtc, isActive} = req.query;
        
        const filter = {};
        
        if (rtc) {
            const rtcArray = Array.isArray(rtc) ? rtc : [rtc];
            filter.rtc = { $in: rtcArray };
        }
        
        if (isActive !== undefined) {
            filter.isActive = isActive === 'true';
        }

        const buses = await Bus.find(filter).lean();
        res.status(200).json({message: "Buses fetched successfully", count: buses.length, buses});
    } catch (error) {
        console.error("Error fetching buses:", error);
        res.status(500).json({ message: "Server error while fetching buses." });
    }
})

router.get("/:busId", async (req, res) => {
    try {
        const {busId} = req.params;
        const bus = await Bus.findById(busId).lean();
        if(!bus){
            return res.status(404).json({message: "Bus not found"});
        }
        res.status(200).json({ message: "Bus fetched successfully", bus });
    } catch (error) {
        console.error("Error fetching bus:", error);
        res.status(500).json({ message: "Server error while fetching bus." });
    }
});

router.post("/", authorise, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Not allowed to create buses" });
        }

        const { routeId, rtc, routeName, registrationNumber, capacity, driverId, isActive } = req.body;

        if (!routeId || !rtc || !routeName || !registrationNumber || !capacity) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const existingBus = await Bus.findOne({ 
            registrationNumber 
        });

        if (existingBus) {
            return res.status(400).json({ message: "Bus with this Registration Number already exists" });
        }

        const newBus = new Bus({
            routeId,
            rtc,
            routeName,
            registrationNumber,
            capacity,
            driverId: driverId || null,
            isActive: isActive !== undefined ? isActive : false
        });

        await newBus.save();
        res.status(201).json({ message: "Bus created successfully", bus: newBus });
    } catch (error) {
        console.error("Error creating bus:", error);
        res.status(500).json({ message: "Server error while creating bus.", error: error.message });
    }
})

router.patch("/:busId", authorise, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Not allowed to update buses" });
        }

        const { busId } = req.params;
        const { routeId, rtc, routeName, registrationNumber, capacity, driverId, isActive, location, latitude, longitude, speed_kmh, heading_deg } = req.body;

        const updateData = {};

        if (routeId !== undefined) updateData.routeId = routeId;
        if (rtc !== undefined) updateData.rtc = rtc;
        if (routeName !== undefined) updateData.routeName = routeName;
        if (registrationNumber !== undefined) updateData.registrationNumber = registrationNumber;
        if (capacity !== undefined) updateData.capacity = capacity;
        if (driverId !== undefined) updateData.driverId = driverId;
        if (isActive !== undefined) updateData.isActive = isActive;

        // Handle location updates
        if (location && location.coordinates) {
            if (!Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
                return res.status(400).json({ message: "Validation Error: 'location.coordinates' must be a [lng, lat] array" });
            }
            updateData.lastKnownLocation = { 
                type: 'Point', 
                coordinates: location.coordinates,
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
                type: 'Point', 
                coordinates: [parsedLng, parsedLat],
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
            { returnDocument: 'after', runValidators: true } // Return the updated document
        );

        if (!updatedBus) {
            return res.status(404).json({ message: "Bus not found" });
        }

        res.status(200).json({ message: "Bus updated successfully", bus: updatedBus });
    } catch (error) {
        console.error("Error updating bus:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: "Bus with this Registration Number already exists." });
        }
        res.status(500).json({ message: "Server error while updating bus.", error: error.message });
    }
})

router.delete("/:busId", authorise, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Not allowed to delete buses" });
        }

        const { busId } = req.params;
        const deletedBus = await Bus.findByIdAndDelete(busId);

        if (!deletedBus) {
            return res.status(404).json({ message: "Bus not found" });
        }

        res.status(200).json({ message: "Bus deleted successfully", bus: deletedBus });

    } catch (error) {
        console.error("Error deleting bus:", error);
        res.status(500).json({ message: "Server error while deleting bus.", error: error.message });
    }
})

router.get("/:busId/status", async (req, res) => {
    try {
        const { busId } = req.params;
        const bus = await Bus.findById(busId, 'isActive lastKnownLocation');
        
        if (!bus) {
            return res.status(404).json({ message: "Bus not found" });
        }

        res.status(200).json({ 
            message: "Bus status fetched successfully", 
            status: {
                isActive: bus.isActive,
                lastKnownLocation: bus.lastKnownLocation
            }
        });
    } catch (error) {
        console.error("Error fetching bus status:", error);
        res.status(500).json({ message: "Server error while fetching bus status.", error: error.message });
    }
})

router.get("/:busId/history", async (req, res) => {
    try {
        const { busId } = req.params;
        const { from, to } = req.query;

        if (!from || !to) {
            return res.status(400).json({ message: "Both 'from' and 'to' epoch timestamps are required." });
        }

        const fromDate = new Date(parseInt(from));
        const toDate = new Date(parseInt(to));

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return res.status(400).json({ message: "Invalid 'from' or 'to' timestamps provided." });
        }

        if (fromDate >= toDate) {
            return res.status(400).json({ message: "'from' must be earlier than 'to'." });
        }

        const history = await BusLocation.find({
            busId: busId,
            timestamp: {
                $gte: fromDate,
                $lte: toDate
            }
        }).sort({ timestamp: 1 }); 
        
        if(!history || history.length === 0) {
            return res.status(404).json({ message: "Bus history not found" });
        }

        res.status(200).json({ 
            message: "Bus history fetched successfully", 
            count: history.length,
            history 
        });

    } catch (error) {
        console.error("Error fetching bus history:", error);
        res.status(500).json({ message: "Server error while fetching bus history.", error: error.message });
    }
})

// Helper function for Haversine formula
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

router.get("/:busId/eta", async (req, res) => {
    try {
        const { busId } = req.params;
        const { stopId } = req.query;

        if (!stopId) {
            return res.status(400).json({ message: "stopId query parameter is required." });
        }

        // Fetch bus and stop concurrently for speed
        const [bus, stop] = await Promise.all([
            Bus.findById(busId, 'lastKnownLocation'),
            Stop.findById(stopId, 'location')
        ]);

        if (!bus) return res.status(404).json({ message: "Bus not found" });
        if (!stop) return res.status(404).json({ message: "Stop not found" });

        if (!bus.lastKnownLocation || !bus.lastKnownLocation.coordinates || bus.lastKnownLocation.coordinates.length < 2) {
            return res.status(400).json({ message: "Bus location is currently unknown." });
        }

        if (!stop.location || !stop.location.coordinates || stop.location.coordinates.length < 2) {
            return res.status(400).json({ message: "Stop location is invalid." });
        }

        const [busLon, busLat] = bus.lastKnownLocation.coordinates;
        const [stopLon, stopLat] = stop.location.coordinates;

        const distanceKm = getDistanceFromLatLonInKm(busLat, busLon, stopLat, stopLon);

        // Determine speed (fallback to 40 km/h if stopped or unknown)
        let speedKmh = bus.lastKnownLocation.speed_kmh;
        if (!speedKmh || speedKmh <= 0) {
            speedKmh = 40; 
        }

        const etaHours = distanceKm / speedKmh;
        const etaMinutes = Math.round(etaHours * 60);

        res.status(200).json({
            message: "ETA calculated successfully",
            distance_km: parseFloat(distanceKm.toFixed(2)),
            speed_kmh: speedKmh,
            eta_minutes: etaMinutes
        });

    } catch (error) {
        console.error("Error calculating ETA:", error);
        res.status(500).json({ message: "Server error while calculating ETA.", error: error.message });
    }
})

module.exports = router