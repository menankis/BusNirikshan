const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  rtc: { 
    type: String, 
    required: true 
  },
  stopIds: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Stop',
    required: true
  }],
  totalDistanceKm: { 
    type: Number, 
    required: true 
  },
  estimatedDurationMin: { 
    type: Number, 
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, {
  timestamps: true // Auto-manages createdAt and updatedAt
});

// Define your indexes
// Unique within an RTC: two different RTCs can share the same route name, but not within one
routeSchema.index({ rtc: 1, name: 1 }, { unique: true });
routeSchema.index({ stopIds: 1 }); // Multikey index: MongoDB indexes every ObjectId inside the array
routeSchema.index({ rtc: 1, isActive: 1 }); // Filter active routes for a specific RTC

const Route = mongoose.model('Route', routeSchema);
module.exports = Route;