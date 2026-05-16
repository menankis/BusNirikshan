const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const jwt = require("jsonwebtoken");

// ─────────────────────────────────────────────────────────────────────────────
// userApiLimiter
//
// Applied AFTER the `authorise` middleware so req.user is guaranteed to exist.
// Keyed on req.user.userId — one bucket per account, regardless of IP.
//
// This is fair for:
//   - CGNAT (many users sharing one public IP)
//   - University / apartment shared connections
//   - Mobile carriers with large NAT pools
//
// ─────────────────────────────────────────────────────────────────────────────
const userApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    keyGenerator: (req) => `user:${req.user.userId}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests from this account. Please try again later." }
});

// ─────────────────────────────────────────────────────────────────────────────
// accountLimiter
//
// Shared by POST /login and POST /register — both are per-email actions.
// Keying on email means login and registration attempts against the same
// address share one bucket, so an attacker can't bypass the login limit
// by toggling between the two endpoints.
// Falls back to IP for requests with no email body.
// ─────────────────────────────────────────────────────────────────────────────
const accountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
        const email = (req.body?.email || "").toLowerCase().trim();
        return email ? `account:${email}` : ipKeyGenerator(req);
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts for this account. Please try again later." }
});

// ─────────────────────────────────────────────────────────────────────────────
// forgotPasswordLimiter
//
// Keyed on email to stop reset-link spam to a single address.
// An attacker flooding a victim's inbox would be throttled per-target, not
// per-IP, so rotating IPs won't help them.
// Falls back to IP for requests with no email body.
// ─────────────────────────────────────────────────────────────────────────────
const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1 hour window
    max: 5,
    keyGenerator: (req) => {
        const email = (req.body?.email || "").toLowerCase().trim();
        return email ? `reset:${email}` : ipKeyGenerator(req);
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many password reset requests for this address. Please try again in an hour." }
});

// ─────────────────────────────────────────────────────────────────────────────
// otpLimiter
//
// Guards POST /register/init (send OTP) and POST /register/verify (check OTP).
// Keyed on email — prevents brute-forcing the 6-digit code and stops OTP spam
// to a victim's inbox regardless of whether the attacker rotates IPs.
// Falls back to IP when no email is present.
// ─────────────────────────────────────────────────────────────────────────────
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15-minute window
    max: 5,
    keyGenerator: (req) => {
        const email = (req.body?.email || "").toLowerCase().trim();
        return email ? `otp:${email}` : ipKeyGenerator(req);
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many OTP attempts for this address. Please try again in 15 minutes." }
});

// ─────────────────────────────────────────────────────────────────────────────
// refreshLimiter
//
// Keyed on the userId decoded from the refresh token cookie.
// jwt.decode() is intentionally used here — NOT jwt.verify().
// We are only extracting a rate-limit key, not authenticating the request.
// Full cryptographic verification still happens inside the route handler.
//
// An attacker forging a token with an arbitrary userId payload just ends up
// in a different rate-limit bucket — it doesn't bypass any security check.
// Falls back to IP if the cookie is absent or the payload has no userId.
// ─────────────────────────────────────────────────────────────────────────────
const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,    // 10 refreshes per 15 min per account — enough for any number of devices
    keyGenerator: (req) => {
        try {
            const token = req.cookies?.refresh_token;
            if (token) {
                const decoded = jwt.decode(token);
                if (decoded?.userId) return `refresh:${decoded.userId}`;
            }
        } catch { /* fall through to IP */ }
        return ipKeyGenerator(req);
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many token refresh requests. Please try again later." }
});

// ─────────────────────────────────────────────────────────────────────────────
// notificationLimiter
//
// Guards POST/PATCH/DELETE /api/notifications/subscribe
// Keyed on userId — prevents a single account from spamming subscriptions.
// Stricter than the general API limiter since subscription changes are
// infrequent by nature — a passenger rarely subscribes/unsubscribes more
// than a few times per session.
// ─────────────────────────────────────────────────────────────────────────────
const notificationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyGenerator: (req) => `notifications:${req.user.userId}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many subscription changes. Please try again later." }
});

module.exports = { userApiLimiter, accountLimiter, forgotPasswordLimiter, otpLimiter, refreshLimiter, notificationLimiter };