const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true // Crucial: This enforces the 1-to-1 relationship
  },
  rtc: { 
    type: String, 
    required: true 
  },
  licenseNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  assignedBusId: { 
    type: mongoose.Schema.Types.ObjectId,
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

const Driver = mongoose.model('Driver', driverSchema);
module.exports = Driver;