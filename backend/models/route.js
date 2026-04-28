const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  rtc: { 
    type: String, 
    enum: ['GSRTC', 'MSRTC', 'RSRTC'], 
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
routeSchema.index({ rtc: 1 });
routeSchema.index({ stopIds: 1 }); // Creates the multikey index

const Route = mongoose.model('Route', routeSchema);
module.exports = Route;