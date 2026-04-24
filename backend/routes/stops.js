const express = require("express");
const Stop = require("../models/stop");
const authMiddleware = require("../middleware/authorise");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const { city, rtc } = req.query;
        
        const filter = {};
        if (city) {
            filter.city = city;
        }
        if (rtc) {
            // Handle both single string (?rtc=MSRTC) and array (?rtc=MSRTC&rtc=GSRTC)
            const rtcArray = Array.isArray(rtc) ? rtc : [rtc];
            filter.rtc = { $in: rtcArray };
        }

        const stops = await Stop.find(filter);
        res.status(200).json({message: "Stops fetched successfully", stops});
    } catch (error) {
        console.error("Error fetching stops:", error);
        res.status(500).json({ message: "Server error while fetching stops." });
    }
});


router.get("/nearby", async (req, res) => {
    try {
        const { longitude, latitude, radius } = req.query;

        if (!longitude || !latitude) {
            return res.status(400).json({ message: "Please provide both longitude and latitude query parameters." });
        }

        const maxDistanceInMeters = radius ? parseInt(radius) : 5000; // Default 5km

        const stops = await Stop.find({
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: maxDistanceInMeters
                }
            }
        });

        res.status(200).json({ message: "Nearby stops fetched successfully", stops });
    } catch (error) {
        console.error("Error fetching nearby stops:", error);
        res.status(500).json({ message: "Server error while fetching nearby stops.", error: error.message });
    }
});


router.get("/:stopId", async (req, res) => {
    try {
        const {stopId} = req.params;
        const stop = await Stop.findById(stopId);
        if(!stop){
            return res.status(404).json({message: "Stop not found"});
        }
        res.status(200).json({message: "Stop fetched successfully", stop: stop});
    } catch (error) {
        console.error("Error fetching stop:", error);
        res.status(500).json({ message: "Server error while fetching stop." });
    }
})


router.post("/", authMiddleware, async (req, res) => {
    try {
        if(req.user.role !== "admin"){
            return res.status(403).json({message: "Forbidden: Not allowed to create stops"});
        }

        const { name, city, state, rtc, location, latitude, longitude, isActive } = req.body;

        if (!name || !city || !state || !rtc) {
            return res.status(400).json({ message: "Missing required fields: name, city, state, rtc" });
        }

        let stopLocation;
        if (location && location.coordinates) {
            stopLocation = { type: 'Point', coordinates: location.coordinates };
        } else if (longitude !== undefined && latitude !== undefined) {
            stopLocation = { type: 'Point', coordinates: [longitude, latitude] };
        } else {
            return res.status(400).json({ message: "Missing required fields: location or latitude/longitude" });
        }

        const newStop = new Stop({
            name,
            city,
            state,
            rtc,
            location: stopLocation,
            isActive: isActive !== undefined ? isActive : true
        });

        await newStop.save();
        res.status(201).json({ message: "Stop created successfully", stop: newStop });

    } catch (error) {
        console.error("Error creating stop:", error);
        res.status(500).json({ message: "Server error while creating stop.", error: error.message });
    }
})

router.patch("/:stopId", authMiddleware, async (req, res) =>{

    try {
        if(req.user.role !== "admin"){
            return res.status(403).json({message: "Forbidden: Not allowed to update stops"});
        }

        const { stopId } = req.params;
        const { name, city, state, rtc, location, latitude, longitude, isActive } = req.body;

        const updateData = {};

        if (name !== undefined) updateData.name = name;
        if (city !== undefined) updateData.city = city;
        if (state !== undefined) updateData.state = state;
        if (rtc !== undefined) updateData.rtc = rtc;
        if (isActive !== undefined) updateData.isActive = isActive;

        // Handle location updates via either 'location' object or lat/long pair
        if (location && location.coordinates) {
            updateData.location = { type: 'Point', coordinates: location.coordinates };
        } else if (longitude !== undefined && latitude !== undefined) {
            updateData.location = { type: 'Point', coordinates: [longitude, latitude] };
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: "No fields provided for update." });
        }

        const updatedStop = await Stop.findByIdAndUpdate(
            stopId,
            { $set: updateData },
            { returnDocument: "after", runValidators: true }
        );

        if (!updatedStop) {
            return res.status(404).json({ message: "Stop not found" });
        }

        res.status(200).json({ message: "Stop updated successfully", stop: updatedStop });

    } catch (error) {
        console.error("Error updating stop:", error);
        res.status(500).json({ message: "Server error while updating stop.", error: error.message });
    }

})

router.delete("/:stopId", authMiddleware, async (req, res) =>{
    try {
        if(req.user.role !== "admin"){
            return res.status(403).json({message: "Forbidden: Not allowed to delete stops"});
        }

        const { stopId } = req.params;
        const deletedStop = await Stop.findByIdAndDelete(stopId);

        if (!deletedStop) {
            return res.status(404).json({ message: "Stop not found" });
        }

        res.status(200).json({ message: "Stop deleted successfully", stop: deletedStop });

    } catch (error) {
        console.error("Error deleting stop:", error);
        res.status(500).json({ message: "Server error while deleting stop.", error: error.message });
    }
})


// Get all buses currently approaching this stop with ETAs
// router.get("/:stopId/buses", async (req, res) => {
//     try {
//         const {stopId} = req.params;
        
//     } catch (error) {
        
//     }
// })




module.exports = router