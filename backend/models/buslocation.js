const mongoose = require('mongoose');

const busLocationSchema = new mongoose.Schema({
  busId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus', 
    required: true 
  },
  timestamp: { 
    type: Date, 
    required: true,
    default: Date.now // Automatically sets the current time if the GPS device doesn't provide one
  },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  speed_kmh: { 
    type: Number 
  },
  heading_deg: { 
    type: Number 
  },
  driverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Driver' 
  }
}, {
  // 1. Configure the Time Series behavior
  timeseries: {
    timeField: 'timestamp',
    metaField: 'busId',
    granularity: 'seconds'
  },
  // 2. Configure the TTL (24 hours)
  expireAfterSeconds: 86400,
  
  // Disable standard timestamps (createdAt/updatedAt) since 'timestamp' handles the time
  timestamps: false 
});

const BusLocation = mongoose.model('BusLocation', busLocationSchema);
module.exports = BusLocation;