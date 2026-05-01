const nodemailer = require("nodemailer");
const dotenv = require("dotenv");

dotenv.config();

/**
 * Shared nodemailer transporter (connection-pooled SMTP).
 *
 * Configure via environment variables:
 *   SMTP_HOST  — SMTP server hostname
 *   SMTP_PORT  — SMTP port (e.g. 587, 465)
 *   SMTP_AUTH  — "true" to enable TLS/SSL
 *   SMTP_USER  — SMTP login username / sender address
 *   SMTP_PASS  — SMTP login password
 */
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    pool: true,
    maxConnections: 5,
    secure: process.env.SMTP_AUTH === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

module.exports = { transporter };
