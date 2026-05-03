require("dotenv").config();
const express = require("express");
const expressWs = require("express-ws");
const cors = require("cors");
const morgan = require("morgan");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const stopRoutes = require("./routes/stops");
const busRoutes = require("./routes/buses");
const locationRoutes = require("./routes/location");
const routeRoutes = require("./routes/routes");
const { locationWsHandler, startRedisSubscriber } = require("./routes/locationWs");
const authorise = require("./middleware/authorise");
const { userApiLimiter } = require("./utils/rateLimiters");

const app = express();
expressWs(app);   // patches app with app.ws() support

app.use(express.json());
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
}));
app.use(morgan("dev"));
app.use(cookieParser())


app.use("/api/auth", authRoutes);
app.use("/api/user",      authorise, userApiLimiter, userRoutes);
app.use("/api/stops",     authorise, userApiLimiter, stopRoutes);
app.use("/api/buses",     authorise, userApiLimiter, busRoutes);
app.use("/api/locations", authorise, userApiLimiter, locationRoutes);
app.use("/api/routes",    authorise, userApiLimiter, routeRoutes);

// WebSocket endpoint — ws://host/api/locations/live
app.ws("/api/locations/live", authorise, locationWsHandler);

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI
app.get("/", (req, res) => {
    res.send("Hello World!");
});

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler
//
// Express 5 automatically forwards async errors thrown in route handlers here.
// Without this, unhandled errors silently hang the request or crash the process.
// Must be registered AFTER all routes.
// ─────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
// app.use((err, req, res, _next) => {
//     console.error("[server] Unhandled error:", err);
//     const status = err.status || err.statusCode || 500;
//     res.status(status).json({
//         message: err.expose ? err.message : "Internal server error"
//     });
// });


mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      // Start the Redis pub/sub subscriber after the server is up
      startRedisSubscriber();
    });
  })
  .catch(err => {
    console.error('Database connection error:', err);
    process.exit(1);
  });
