const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'user', 
    required: true,
    unique: true // Crucial: This enforces the 1-to-1 relationship
  },
  rtc: { 
    type: String, 
    enum: ['GSRTC', 'MSRTC', 'RSRTC'], 
    required: true 
  },
  licenseNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  assignedBusId: { 
    type: String, // Note: If Buses uses ObjectIds instead of strings (like number plates), change this to mongoose.Schema.Types.ObjectId
    ref: 'Bus',
    default: null 
  },
  isOnShift: { 
    type: Boolean, 
    default: false 
  },
  shiftStartedAt: { 
    type: Date, 
    default: null 
  },
  totalShifts: { 
    type: Number, 
    default: 0 
  }
}, {
  timestamps: true // Auto-manages createdAt and updatedAt
});

// Define your additional indexes (Mongoose auto-builds the unique ones defined above)
driverSchema.index({ assignedBusId: 1 });
driverSchema.index({ rtc: 1, isOnShift: 1 });

const Driver = mongoose.model('driver', driverSchema);
module.exports = Driver;