const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/user");
const requireRole = require("../middleware/requireRole");
const { parsePagination } = require("../utils/pagination");

const router = express.Router();

// All admin routes are protected — only admins can call these
router.use(requireRole("admin"));

/**
 * @route   GET /api/admin/users
 * @desc    List all users. Supports filtering by ?role=admin|driver|user
 * @access  Private (Admin)
 * @param   {string} [req.query.role] - Filter by user role (admin, driver, user)
 * @param   {number} [req.query.page] - Pagination page number
 * @param   {number} [req.query.limit] - Pagination limit per page
 */
router.get("/users", async (req, res) => {
  try {
    const { role } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const VALID_ROLES = ["admin", "driver", "user"];
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(", ")}` });
    }

    const filter = {};
    if (role) filter.role = role;

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("-password -__v")
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      message: "Users fetched successfully",
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
      users,
    });
  } catch (err) {
    console.error("[GET /admin/users]", err);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
});

/**
 * @route   PATCH /api/admin/users/:userId/role
 * @desc    Change a user's role. Body: { role: "admin" | "driver" | "user" }
 * @access  Private (Admin)
 * @param   {string} req.params.userId - User ID (Path)
 * @param   {string} req.body.role - New role ("admin" | "driver" | "user")
 */
router.patch("/users/:userId/role", async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const VALID_ROLES = ["admin", "driver", "user"];
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(", ")}` });
    }

    // prevent admin from demoting themselves
    if (req.user._id.toString() === userId && role !== "admin") {
      return res.status(400).json({ message: "You cannot change your own role" });
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { role } },
      { new: true }
    ).select("-password -__v");

    if (!updated) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "User role updated successfully", user: updated });
  } catch (err) {
    console.error("[PATCH /admin/users/:userId/role]", err);
    return res.status(500).json({ message: "Failed to update user role" });
  }
});

/**
 * @route   GET /api/admin/system/health
 * @desc    Pings MongoDB and Redis to check system health.
 * @access  Private (Admin)
 */
router.get("/system/health", async (req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      mongodb: { status: "unknown", latency_ms: null },
      redis:   { status: "unknown", latency_ms: null },
    },
  };

  // check MongoDB
  try {
    const mongoStart = Date.now();
    await mongoose.connection.db.command({ ping: 1 });
    health.services.mongodb = { status: "ok", latency_ms: Date.now() - mongoStart };
  } catch (err) {
    health.services.mongodb = { status: "error", error: err.message };
    health.status = "degraded";
  }

  // check Redis
  try {
    // the redis client is attached to app locals by server.js
    const redis = req.app.locals.redisClient;
    if (!redis) throw new Error("Redis client not available");
    const redisStart = Date.now();
    await redis.ping();
    health.services.redis = { status: "ok", latency_ms: Date.now() - redisStart };
  } catch (err) {
    health.services.redis = { status: "error", error: err.message };
    health.status = "degraded";
  }

  const httpStatus = health.status === "ok" ? 200 : 503;
  return res.status(httpStatus).json(health);
});

/**
 * @route   GET /api/admin/system/instances
 * @desc    Returns registered Node.js server instances from Redis.
 * @access  Private (Admin)
 */
router.get("/system/instances", async (req, res) => {
  try {
    const redis = req.app.locals.redisClient;
    if (!redis) {
      return res.status(503).json({ message: "Redis client not available" });
    }

    // instances register themselves in Redis under keys like "instance:<id>"
    const keys = await redis.keys("instance:*");

    const instanceData = keys.length > 0
      ? await Promise.all(
          keys.map(async (key) => {
            const raw = await redis.get(key);
            try { return JSON.parse(raw); } catch { return { key, raw }; }
          })
        )
      : [];

    return res.status(200).json({
      message: "Instances fetched successfully",
      count: instanceData.length,
      instances: instanceData,
    });
  } catch (err) {
    console.error("[GET /admin/system/instances]", err);
    return res.status(500).json({ message: "Failed to fetch instances" });
  }
});

module.exports = router;