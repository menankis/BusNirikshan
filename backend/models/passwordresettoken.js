const mongoose = require('mongoose');

const PasswordResetTokenSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', // References your User collection
    required: true 
  },
  email: { 
    type: String, 
    required: true
    // NOTE: NOT unique — a user may request multiple resets; only the token itself is unique
  },    
  token: { 
    type: String, 
    required: true, 
    unique: true 
  },
  expiresAt: { 
    type: Date, 
    required: true,
    expires: 0 // Creates the TTL index (expireAfterSeconds: 0)
  },
  used: { 
    type: Boolean, 
    default: false // Auto-sets to false when a new document is created
  }
}, {
  // We only need createdAt for this collection
  timestamps: { createdAt: true, updatedAt: false } 
});

// Find all tokens for a user (e.g. cleanup on reset request)
PasswordResetTokenSchema.index({ userId: 1 });

// Compound index: powers deleteMany({ userId, used: false }) in auth.js — avoids full collection scan
PasswordResetTokenSchema.index({ userId: 1, used: 1 });

const PasswordResetToken = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
module.exports = PasswordResetToken;