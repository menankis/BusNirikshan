/**
 * requireRole(...roles)
 *
 * Express middleware factory that enforces role-based access control.
 * Must be used AFTER the `authorise` middleware (which populates req.user).
 *
 * Usage:
 *   router.post("/", authorise, requireRole("admin"), handler)
 *   router.post("/", authorise, requireRole("admin", "manager"), handler)
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: `Forbidden: Only ${roles.join(" or ")} can perform this action`
            });
        }
        next();
    };
}

module.exports = requireRole;
