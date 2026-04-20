const mongoose = require('mongoose');

const PasswordResetTokenSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', // References your User collection
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true
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

const PasswordResetToken = mongoose.model('passwordresettoken', PasswordResetTokenSchema);
module.exports = PasswordResetToken;