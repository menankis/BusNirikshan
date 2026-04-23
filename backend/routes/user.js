const authMiddleware = require("../middleware/authorise");
const express = require("express");
const User = require("../models/user");
const RefreshToken = require("../models/refreshtoken");
const PasswordResetToken = require("../models/passwordresettoken");

const router = express.Router();

const validatePassword = (password) => {
    if (!password) return "Password is required";
    if (password.length < 8) return "Password must be at least 8 characters long";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
    if (!/\d/.test(password)) return "Password must contain at least one number";
    // if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return "Password must contain at least one special character";
    return null;
};

router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId).select("name email role rtc createdAt");
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ message: "Profile fetched successfully", user });
    } catch (error) {
        console.error("Get User Profile Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.patch("/:userId", authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.userId !== userId && req.user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Not allowed to update this profile" });
        }

        const updates = {};
        const allowedFields = ["name", "email", "role", "rtc", "isActive"];
        
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }


        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No valid fields provided for update" });
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updates, { 
            returnDocument: "after", 
            runValidators: true 
        }).select("-passwordHash");

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ message: "User updated successfully", user: updatedUser });
    } catch (error) {
        console.error("Patch User Error:", error);
        
        // Handle MongoDB duplicate key error (e.g., email already exists)
        if (error.code === 11000) {
            return res.status(409).json({ message: "Email already in use" });
        }
        
        res.status(500).json({ message: "Internal server error" });
    }
});


router.delete("/:userId", authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.userId !== userId && req.user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Not allowed to delete this profile" });
        }

        const deletedUser = await User.findByIdAndDelete(userId);

        if (!deletedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // cascade delete any related session and password tokens for security
        await RefreshToken.deleteMany({ userId });
        await PasswordResetToken.deleteMany({ userId });

        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("Delete User Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
})

module.exports = router;