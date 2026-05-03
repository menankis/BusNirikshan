const jwt = require("jsonwebtoken");

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

const authorise = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Unauthorized: No token provided" });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            // Client should attempt a silent refresh via POST /api/auth/refresh
            return res.status(401).json({
                code: "token_expired",
                message: "Unauthorized: Access token has expired"
            });
        }
        // Forged, malformed, or wrong-secret token — force the client to log out
        return res.status(401).json({
            code: "token_invalid",
            message: "Unauthorized: Invalid token"
        });
    }
};

module.exports = authorise;