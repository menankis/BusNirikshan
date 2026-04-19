const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true
  },
  passwordHash: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['passenger', 'driver', 'admin'], 
    required: true 
  },
  rtc: { 
    type: String, 
    enum: ['GSRTC', 'MSRTC', 'RSRTC', null], 
    default: null 
  },
  isActive: { 
    type: Boolean, 
    default: true
  }
}, {
  timestamps: true,
  collection: 'users'
});

const User = mongoose.model('User', userSchema);
module.exports = User;