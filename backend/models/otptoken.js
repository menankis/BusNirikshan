const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// OtpToken
//
// Generic short-lived, single-use OTP carrier.
// The raw 6-digit code is NEVER persisted — only its bcrypt hash is stored,
// so a DB leak cannot be replayed directly.
//
// `pendingData` is an opaque Mixed blob.  This model deliberately knows nothing
// about the User schema — callers store whatever registration payload they
// need, and retrieve it at verify time.  Adding or renaming User fields
// requires no changes here.
//
// Lifecycle:
//   POST /auth/register/init   → creates one OtpToken per email
//   POST /auth/register/verify → atomically marks it used, then saves the user
//
// TTL: MongoDB automatically deletes the document after `expiresAt`.
// ─────────────────────────────────────────────────────────────────────────────
const OtpTokenSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
        // NOT unique — each /init call creates a fresh token for the same email
    },
    codeHash: {
        type: String,
        required: true
        // bcrypt hash of the 6-digit OTP. Raw code is never stored.
    },
    // Opaque payload — the caller owns the shape, not this schema.
    // /register/init writes registration fields here;
    // /register/verify reads them back to create the User.
    pendingData: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    expiresAt: {
        type: Date,
        required: true,
        expires: 0  // TTL index — MongoDB drops the doc when expiresAt is reached
    },
    used: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }
});

// Powers: deleteMany({ email }) on re-send and cleanup
OtpTokenSchema.index({ email: 1 });

// Powers: findOneAndUpdate({ email, used: false }) in /verify — avoids full scan
OtpTokenSchema.index({ email: 1, used: 1 });

const OtpToken = mongoose.model('OtpToken', OtpTokenSchema);
module.exports = OtpToken;
