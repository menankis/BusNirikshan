const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', // Creates a relationship with your User model
    required: true 
  },
  email: { 
    type: String, 
    required: true 
    // NOTE: NOT unique — one user can have multiple active sessions (mobile + desktop)
  },
  token: { 
    type: String, 
    required: true, 
    unique: true 
  },
  expiresAt: { 
    type: Date, 
    required: true,
    expires: 0 // Mongoose shorthand to create the TTL index (expireAfterSeconds: 0)
  }

}, {
  // We only need createdAt for this collection, updatedAt isn't strictly necessary for a static token
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'refreshtokens'
});

// Find all active sessions for a given user (e.g. "log out all devices")
refreshTokenSchema.index({ userId: 1 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
module.exports = RefreshToken;