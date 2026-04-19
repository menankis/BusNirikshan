const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', // Creates a relationship with your User model
    required: true 
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

const RefreshToken = mongoose.model('refreshtoken', refreshTokenSchema);
module.exports = RefreshToken;