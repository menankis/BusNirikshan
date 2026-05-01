const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  driverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Driver', // References your Driver collection
    required: true 
  },
  busId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus', 
    required: true 
  },
  startedAt: { 
    type: Date, 
    default: Date.now,
    required: true 
  },
  endedAt: { 
    type: Date, 
    default: null // Null means the shift is currently active
  },
  durationMin: { 
    type: Number,
    default: null
  },
  totalPointsRecorded: { 
    type: Number, 
    default: 0 
  },
  startLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  endLocation: {
    lat: { type: Number },
    lng: { type: Number }
  }
}, {
  // We can disable standard timestamps here because startedAt/endedAt handle the timing logic naturally
  timestamps: false 
});

// Define your indexes for fast querying
shiftSchema.index({ driverId: 1, startedAt: -1 });
shiftSchema.index({ busId: 1, startedAt: -1 });
shiftSchema.index({ endedAt: 1 });

const Shift = mongoose.model('Shift', shiftSchema);
module.exports = Shift;