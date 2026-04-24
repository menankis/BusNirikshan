const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  city: { 
    type: String, 
    required: true 
  },
  state: { 
    type: String, 
    required: true 
  },
  rtc: {
    type: [{ 
      type: String, 
      enum: ['GSRTC', 'MSRTC', 'RSRTC', 'ALL', 'NONE'] 
    }],
    required: true,
    validate: [v => v.length > 0, 'A stop must belong to at least one RTC']
  },
  location: {
    type: {
      type: String, 
      enum: ['Point'], 
      required: true
    },
    coordinates: {
      type: [Number], // Array of numbers
      required: true
    }
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, {
  timestamps: true // Auto-manages createdAt and updatedAt
});

// Define your indexes at the schema level
stopSchema.index({ location: '2dsphere' });
stopSchema.index({ city: 1 });
stopSchema.index({ rtc: 1 });

const Stop = mongoose.model('Stop', stopSchema);
module.exports = Stop;