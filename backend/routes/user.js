const authMiddleware = require("../middleware/authorise");
const express = require("express");
const User = require("../models/user");
const RefreshToken = require("../models/refreshtoken");
const PasswordResetToken = require("../models/passwordresettoken");
const { validatePassword } = require("../utils/validation");
const { getOrSet, invalidate } = require("../utils/cache");

const router = express.Router();

// Cache TTLs (seconds)
const TTL = {
    USER_PROFILE: 30,   // profile changes infrequently; invalidated on every write
};

const userCacheKey = (userId) => `user:profile:${userId}`;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user/:userId
// Fetch a user's own profile (or any profile for admins).
//
// Cached for TTL.USER_PROFILE seconds per userId.
// Cache is invalidated immediately on PATCH and DELETE.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:userId", authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        // Non-admins can only view their own profile
        if (req.user.userId !== userId && req.user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Not allowed to view this profile" });
        }

        const user = await getOrSet(
            userCacheKey(userId),
            TTL.USER_PROFILE,
            () => User.findById(userId).select("name email role rtc createdAt").lean()
        );
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ message: "Profile fetched successfully", user });
    } catch (error) {
        console.error("Get User Profile Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/user/:userId
// Update a user's own profile (or any profile for admins).
//
// Invalidates the user's profile cache entry on success.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:userId", authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.userId !== userId && req.user.role !== "admin") {
            return res.status(403).json({ message: "Forbidden: Not allowed to update this profile" });
        }

        const updates = {};
        // Privileged fields that only admins may change
        const adminOnlyFields = ["role"];
        const allowedFields = ["name", "email", "role", "rtc", "isActive"];
        
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                if (adminOnlyFields.includes(field) && req.user.role !== "admin") {
                    return res.status(403).json({
                        message: `Forbidden: Only admins can change '${field}'`
                    });
                }
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

        // Profile changed — evict the cached entry so the next GET is fresh
        await invalidate(userCacheKey(userId));

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

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/user/:userId
// Delete a user and cascade-remove their sessions and password tokens.
//
// Invalidates the user's profile cache entry.
// ─────────────────────────────────────────────────────────────────────────────
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

        // Evict the cached profile — the user no longer exists
        await invalidate(userCacheKey(userId));

        // Cascade delete any related session and password tokens for security
        await Promise.all([
            RefreshToken.deleteMany({ userId }),
            PasswordResetToken.deleteMany({ userId })
        ]);

        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("Delete User Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
})

module.exports = router;