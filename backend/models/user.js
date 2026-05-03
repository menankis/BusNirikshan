const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true  // Strip leading/trailing whitespace from display names
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,  // Normalise to lowercase so "User@Gmail.com" === "user@gmail.com"
    trim: true
  },
  passwordHash: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['user', 'driver', 'admin'], 
    required: true 
  },
  rtc: { 
    type: String, 
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