const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// Notification Subscription Model
//
// A passenger subscribes to a stop + route combination.
// When a bus on that route is within `thresholdMinutes` ETA of the stop,
// a notification is triggered.
// ─────────────────────────────────────────────────────────────────────────────
const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  stopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Stop",
    required: true,
  },
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Route",
    required: true,
  },
  thresholdMinutes: {
    type: Number,
    required: true,
    default: 5,
    min: 1,
    max: 60,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastNotifiedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// one user can only have one subscription per stop+route combination
notificationSchema.index({ userId: 1, stopId: 1, routeId: 1 }, { unique: true });
notificationSchema.index({ userId: 1, isActive: 1 });

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
