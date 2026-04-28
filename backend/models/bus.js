const mongoose = require('mongoose');

const busSchema = new mongoose.Schema({
  _id: { 
    type: String, // Overrides the default ObjectId with your Natural Key
    required: true 
  },
  routeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Route', 
    required: true 
  },
  rtc: { 
    type: String, 
    enum: ['GSRTC', 'MSRTC', 'RSRTC'], 
    required: true 
  },
  routeName: { 
    type: String, 
    required: true 
  },
  registrationNumber: { 
    type: String, 
    required: true 
  },
  capacity: { 
    type: Number, 
    required: true 
  },
  driverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'driver', // Assuming this links to the DriverProfile collection made earlier
    default: null 
  },
  isActive: { 
    type: Boolean, 
    default: false // Defaults to false until they start their shift
  },
  lastKnownLocation: {
    lat: { type: Number },
    lng: { type: Number },
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
busSchema.index({ driverId: 1 });
busSchema.index({ 'lastKnownLocation.recordedAt': 1 });

const Bus = mongoose.model('Bus', busSchema);
module.exports = Bus;