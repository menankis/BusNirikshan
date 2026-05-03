const mongoose = require('mongoose');

const busSchema = new mongoose.Schema({
  routeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Route', 
    required: true 
  },
  rtc: { 
    type: String, 
    required: true 
  },
  routeName: { 
    type: String, 
    required: true 
  },
  registrationNumber: { 
    type: String, 
    required: true,
    unique: true  // A vehicle registration plate is globally unique
  },
  capacity: { 
    type: Number, 
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: false // Defaults to false until they start their shift
  },
  // GeoJSON Point — enables $near queries ("find buses within 5km of stop X")
  lastKnownLocation: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number] // [longitude, latitude] — GeoJSON order (lng first)
    },
    speed_kmh: { type: Number },
    heading_deg: { type: Number },
    recordedAt: { type: Date }
  }
}, {
  timestamps: true // Auto-manages createdAt and updatedAt
});

// Define your indexes
busSchema.index({ rtc: 1, isActive: 1 });
busSchema.index({ routeId: 1 });
// sparse: true — skips buses with no location yet (off-shift) so they don't fail the 2dsphere constraint
busSchema.index({ lastKnownLocation: '2dsphere' }, { sparse: true });
busSchema.index({ 'lastKnownLocation.recordedAt': 1 });

const Bus = mongoose.model('Bus', busSchema);
module.exports = Bus;