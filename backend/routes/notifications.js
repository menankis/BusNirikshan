const express = require("express");
const mongoose = require("mongoose");
const Notification = require("../models/notification");
const Stop = require("../models/stop");
const Bus = require("../models/bus");
const { getDistanceKm } = require("../utils/geo");

const router = express.Router();

const DEFAULT_SPEED_KMH = 40;

/**
 * @route   POST /api/notifications/subscribe
 * @desc    Passenger subscribes to ETA alerts for a specific stop + route. When a bus on that route gets within thresholdMinutes of the stop, they get notified.
 * @access  Private
 * @param   {string} req.body.stopId - ID of the stop
 * @param   {string} req.body.routeId - ID of the route
 * @param   {number} [req.body.thresholdMinutes=5] - ETA threshold in minutes to trigger alert
 */
router.post("/subscribe", async (req, res) => {
  try {
    const { stopId, routeId, thresholdMinutes = 5 } = req.body;
    const userId = req.user.userId;

    if (!stopId || !routeId) {
      return res.status(400).json({ message: "stopId and routeId are required" });
    }
    if (!mongoose.isValidObjectId(stopId)) {
      return res.status(400).json({ message: "Invalid stopId" });
    }
    if (!mongoose.isValidObjectId(routeId)) {
      return res.status(400).json({ message: "Invalid routeId" });
    }
    if (thresholdMinutes < 1 || thresholdMinutes > 60) {
      return res.status(400).json({ message: "thresholdMinutes must be between 1 and 60" });
    }

    // check stop exists
    const stop = await Stop.findById(stopId, "name").lean();
    if (!stop) return res.status(404).json({ message: "Stop not found" });
    const Route = require("../models/route");
    const route = await Route.findById(routeId, "name").lean();
    if (!route) return res.status(404).json({ message: "Route not found" });

    // upsert — if subscription already exists, update the threshold
    const subscription = await Notification.findOneAndUpdate(
      { userId, stopId, routeId },
      {
        $set: {
          thresholdMinutes,
          isActive: true,
          lastNotifiedAt: null,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    return res.status(201).json({
      message: "Subscribed to notifications successfully",
      subscription,
    });
  } catch (err) {
    console.error("[POST /notifications/subscribe]", err);
    return res.status(500).json({ message: "Failed to subscribe" });
  }
});

/**
 * @route   DELETE /api/notifications/subscribe
 * @desc    Passenger unsubscribes from alerts for a specific stop + route.
 * @access  Private
 * @param   {string} req.body.stopId - ID of the stop
 * @param   {string} req.body.routeId - ID of the route
 */
router.delete("/subscribe", async (req, res) => {
  try {
    const { stopId, routeId } = req.body;
    const userId = req.user.userId;

    if (!stopId || !routeId) {
      return res.status(400).json({ message: "stopId and routeId are required" });
    }
    if (!mongoose.isValidObjectId(stopId)) {
      return res.status(400).json({ message: "Invalid stopId" });
    }
    if (!mongoose.isValidObjectId(routeId)) {
      return res.status(400).json({ message: "Invalid routeId" });
    }

    const deleted = await Notification.findOneAndDelete({ userId, stopId, routeId });

    if (!deleted) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    return res.status(200).json({ message: "Unsubscribed successfully" });
  } catch (err) {
    console.error("[DELETE /notifications/subscribe]", err);
    return res.status(500).json({ message: "Failed to unsubscribe" });
  }
});

/**
 * @route   GET /api/notifications
 * @desc    Lists all active subscriptions for the logged-in passenger. Also checks current ETA for each subscription so the passenger can see how far away their bus is right now.
 * @access  Private
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.user.userId;

    const subscriptions = await Notification.find({ userId, isActive: true })
      .populate("stopId", "name location city")
      .populate("routeId", "routeName rtc")
      .lean();

    if (subscriptions.length === 0) {
      return res.status(200).json({
        message: "No active subscriptions",
        subscriptions: [],
      });
    }

    // for each subscription, check current ETA of nearest bus on that route
    const enriched = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const stopCoords = sub.stopId?.location?.coordinates;
          if (!stopCoords || stopCoords.length < 2) {
            return { ...sub, currentEta: null };
          }

          const [stopLng, stopLat] = stopCoords;

          // find active buses on this route
          const activeBuses = await Bus.find(
            { routeId: sub.routeId._id, isActive: true },
            "lastKnownLocation registrationNumber"
          ).lean();

          if (activeBuses.length === 0) {
            return { ...sub, currentEta: null, nearestBus: null };
          }

          // calculate ETA for each active bus and find the nearest one
          let nearestEta = Infinity;
          let nearestBus = null;

          for (const bus of activeBuses) {
            const coords = bus.lastKnownLocation?.coordinates;
            if (!coords || coords.length < 2) continue;

            const [busLng, busLat] = coords;
            const distanceKm = getDistanceKm(busLat, busLng, stopLat, stopLng);
            const speedKmh = bus.lastKnownLocation?.speed_kmh > 0
              ? bus.lastKnownLocation.speed_kmh
              : DEFAULT_SPEED_KMH;
            const etaMinutes = Math.round((distanceKm / speedKmh) * 60);

            if (etaMinutes < nearestEta) {
              nearestEta = etaMinutes;
              nearestBus = {
                busId: bus._id,
                registrationNumber: bus.registrationNumber,
                eta_minutes: etaMinutes,
                distance_km: parseFloat(distanceKm.toFixed(2)),
              };
            }
          }

          // check if threshold is crossed
          const alertTriggered = nearestBus && nearestEta <= sub.thresholdMinutes;

          return {
            ...sub,
            nearestBus,
            alertTriggered,
          };
        } catch {
          return { ...sub, nearestBus: null, alertTriggered: false };
        }
      })
    );

    return res.status(200).json({
      message: "Subscriptions fetched successfully",
      count: enriched.length,
      subscriptions: enriched,
    });
  } catch (err) {
    console.error("[GET /notifications]", err);
    return res.status(500).json({ message: "Failed to fetch subscriptions" });
  }
});

/**
 * @route   PATCH /api/notifications/subscribe
 * @desc    Update the threshold minutes for an existing subscription
 * @access  Private
 * @param   {string} req.body.stopId - ID of the stop
 * @param   {string} req.body.routeId - ID of the route
 * @param   {number} req.body.thresholdMinutes - New ETA threshold in minutes to trigger alert
 */
router.patch("/subscribe", async (req, res) => {
  try {
    const { stopId, routeId, thresholdMinutes } = req.body;
    const userId = req.user.userId;

    if (!stopId || !routeId || !thresholdMinutes) {
      return res.status(400).json({ message: "stopId, routeId and thresholdMinutes are required" });
    }
    if (!mongoose.isValidObjectId(stopId)) {
      return res.status(400).json({ message: "Invalid stopId" });
    }
    if (!mongoose.isValidObjectId(routeId)) {
      return res.status(400).json({ message: "Invalid routeId" });
    }
    if (thresholdMinutes < 1 || thresholdMinutes > 60) {
      return res.status(400).json({ message: "thresholdMinutes must be between 1 and 60" });
    }

    const updated = await Notification.findOneAndUpdate(
      { userId, stopId, routeId },
      { $set: { thresholdMinutes } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Subscription not found. Subscribe first." });
    }

    return res.status(200).json({
      message: "Threshold updated successfully",
      subscription: updated,
    });
  } catch (err) {
    console.error("[PATCH /notifications/subscribe]", err);
    return res.status(500).json({ message: "Failed to update threshold" });
  }
});

module.exports = router;