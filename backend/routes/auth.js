const express = require("express");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const RefreshToken = require("../models/refreshtoken");
const PasswordResetToken = require("../models/passwordresettoken");
const authorise = require("../middleware/authorise");
const { transporter } = require("../utils/mailer");
const { validatePassword } = require("../utils/validation");

dotenv.config();

const router = express.Router();

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS, 10) || 10;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const RESET_TOKEN_SECRET = process.env.RESET_TOKEN_SECRET;

router.post("/register", async (req, res) => {
    try {
        const {name, email, password, role, rtc} = req.body;

        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({message: passwordError});
        }

        if(await User.findOne({email})){
            return res.status(400).json({message: "User already exists"});
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        
        const user = new User({
            name,
            email,
            passwordHash,
            role,
            rtc
        });

        await user.save();
        res.status(201).json({message: "User created successfully"});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: "Internal server error"});
    }
});

router.post("/login", async (req, res) => {
    try {
        const {email, password} = req.body;

        if (!email || !password) {
            return res.status(400).json({message: "Email and password are required"});
        }

        const user = await User.findOne({email});
        const isPasswordValid = await bcrypt.compare(password, user ? user.passwordHash : "");

        if(!user || !isPasswordValid){
            return res.status(401).json({message: "Invalid username or password"});
        }

        const access_token = jwt.sign({userId: user._id,
                                name: user.name,
                                email: user.email, 
                                role: user.role, 
                                rtc: user.rtc, 
                                isActive: user.isActive}, ACCESS_TOKEN_SECRET, {expiresIn: "15min"});

        const refresh_token = jwt.sign({userId: user._id, email: user.email}, REFRESH_TOKEN_SECRET, {expiresIn: "7d"});
        
        // Create a new session document — one per device/browser (multi-session support)
        await RefreshToken.create({
            userId: user._id,
            email: user.email,
            token: refresh_token,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        res.cookie("refresh_token", refresh_token, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.status(200).json({message: "Login successful", access_token: access_token});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: "Internal server error"});
    }
});


router.post("/logout", authorise, async (req, res) => {
    try {
        const refresh_token = req.cookies.refresh_token;
        if(!refresh_token){
            return res.status(401).json({message: "No refresh token found"});
        }
        await RefreshToken.deleteOne({token: refresh_token});
        res.clearCookie("refresh_token");
        res.status(200).json({message: "Logout successful"});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: "Internal server error"});
    }
});


router.post("/logout-all", authorise, async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await RefreshToken.deleteMany({ userId });

        res.clearCookie("refresh_token");

        res.status(200).json({
            message: "Logged out from all devices successfully",
            sessionsRevoked: result.deletedCount
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: "Internal server error"});
    }
});


router.post("/refresh", async (req, res) => {
    try {
        const refresh_token = req.cookies.refresh_token;
        if(!refresh_token){
            return res.status(401).json({message: "No refresh token found"});
        }
        
        const decoded = jwt.verify(refresh_token, REFRESH_TOKEN_SECRET);

        const tokenDoc = await RefreshToken.findOne({token: refresh_token});
        if(!tokenDoc){
            return res.status(403).json({message: "Invalid refresh token"});
        }
        
        const user = await User.findById(decoded.userId);
        if(!user) {
            return res.status(403).json({message: "User not found"});
        }

        const new_access_token = jwt.sign({
            userId: user._id,
            name: user.name,
            email: user.email, 
            role: user.role, 
            rtc: user.rtc, 
            isActive: user.isActive
        }, ACCESS_TOKEN_SECRET, {expiresIn: "15min"});

        const new_refresh_token = jwt.sign({userId: user._id, email: user.email}, REFRESH_TOKEN_SECRET, {expiresIn: "7d"});

        // Replace only this specific session's token (token rotation — old token is deleted, new one is inserted)
        await RefreshToken.findOneAndReplace(
            { token: refresh_token },
            {
                userId: user._id,
                email: user.email,
                token: new_refresh_token,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            },
            { upsert: true }
        );

        res.cookie("refresh_token", new_refresh_token, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.status(200).json({
            message: "Token refreshed successfully", 
            access_token: new_access_token
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
            return res.status(403).json({message: "Invalid or expired refresh token"});
        }
        console.error(error);
        res.status(500).json({message: "Internal server error"});
    }
});

router.post("/forgot-password", async (req, res) => {
    try {
        const {email} = req.body;

        if (!email) {
            return res.status(400).json({message: "Email is required"});
        }

        const user = await User.findOne({email});
        if(!user) {
            return res.status(404).json({message: "User not found"});
        }

        const resetToken = jwt.sign({userId: user._id, email: user.email}, RESET_TOKEN_SECRET, {expiresIn: "15min"});
        
        // Invalidate any existing unused tokens for this user before issuing a new one
        await PasswordResetToken.deleteMany({ userId: user._id, used: false });

        // Create a fresh reset token document
        await PasswordResetToken.create({
            userId: user._id,
            email: user.email,
            token: resetToken,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
            used: false
        });

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

        const mailOptions = {
            from: process.env.SMTP_USER,
            to: user.email,
            subject: "Password Reset Request",
            html: `<p>You requested a password reset. Click the link below to reset your password:</p>
                   <p><a href="${resetLink}">Reset Password</a></p>
                   <p>If you didn't request this, please ignore this email.</p>
                   <p>This link is valid for 15 minutes.</p>`
        };
        
        if(await transporter.verify()){
            await transporter.sendMail(mailOptions);
            res.status(200).json({message: "Password reset link sent to your email"});
        }
        else{
            console.error("Can't verify transporter")
            res.status(500).json({message: "Internal server error"});
        }
        
        
    } catch (err) {
        console.error(err);
        res.status(500).json({message: "Internal server error"});
    }
});


router.post("/reset-password", async (req, res) => {
    try {
        const {token, newPassword} = req.body;

        const passwordError = validatePassword(newPassword);
        if (passwordError) {
            return res.status(400).json({message: passwordError});
        }

        const decoded = jwt.verify(token, RESET_TOKEN_SECRET);
        const tokenDoc = await PasswordResetToken.findOne({ token });
        if (!tokenDoc) {
            return res.status(403).json({ message: "Invalid or expired reset token" });
        }
        // Guard against token replay attacks — once used, it can never be used again
        if (tokenDoc.used) {
            return res.status(403).json({ message: "Reset token has already been used" });
        }

        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(403).json({ message: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(newPassword, user.passwordHash);
        if (isPasswordValid) {
            return res.status(400).json({ message: "New password cannot be same as old password" });
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await User.updateOne({ _id: user._id }, { passwordHash });

        // Mark as used first (atomic guard), then clean up all reset tokens for this user
        await PasswordResetToken.updateOne({ token }, { used: true });
        await PasswordResetToken.deleteMany({ userId: user._id });

        // Security: revoke ALL active sessions — a password change must invalidate every device
        await RefreshToken.deleteMany({ userId: user._id });

        res.status(200).json({ message: "Password reset successful. Please log in again on all your devices." });
    } catch (error) {
        if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
            return res.status(403).json({message: "Invalid or expired reset token"});
        }
        console.error(error);
        res.status(500).json({message: "Internal server error"});
    }
});

module.exports = router;
