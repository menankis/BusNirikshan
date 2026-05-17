require("dotenv").config();
const express = require("express");
const expressWs = require("express-ws");
const cors = require("cors");
const morgan = require("morgan");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const authRoutes     = require("./routes/auth");
const userRoutes     = require("./routes/user");
const stopRoutes     = require("./routes/stops");
const busRoutes      = require("./routes/buses");
const locationRoutes = require("./routes/location");
const routeRoutes    = require("./routes/routes");
const { locationWsHandler, startRedisSubscriber } = require("./routes/locationWs");

const driverRoutes      = require("./routes/drivers");
const etaRoutes         = require("./routes/eta");
const analyticsRoutes   = require("./routes/analytics");
const adminRoutes       = require("./routes/admin");
const locationSseRoutes = require("./routes/locationSse");

const authorise       = require("./middleware/authorise");
const { userApiLimiter, notificationLimiter } = require("./middleware/rateLimiters");
const notificationRoutes = require("./routes/notifications");

const app = express();
expressWs(app);
app.set("trust proxy", true);
app.use(express.json());
app.use(cors({
  origin: [process.env.FRONTEND_URL, "http://localhost:3000", "http://localhost:5173"],
  credentials: true,
}));
app.use(morgan("dev"));
app.use(cookieParser());

app.use("/api/auth",      authRoutes);
app.use("/api/user",      authorise, userApiLimiter, userRoutes);
app.use("/api/stops",     authorise, userApiLimiter, stopRoutes);
app.use("/api/buses",     authorise, userApiLimiter, busRoutes);
app.use("/api/locations", authorise, userApiLimiter, locationRoutes);
app.use("/api/routes",    authorise, userApiLimiter, routeRoutes);

app.use("/api/drivers",   authorise, userApiLimiter, driverRoutes);
app.use("/api/eta",       authorise, userApiLimiter, etaRoutes);
app.use("/api/analytics", authorise, userApiLimiter, analyticsRoutes);
app.use("/api/admin",     authorise, adminRoutes);               // no rate limiter for admin ops

app.use("/api/locations", authorise, userApiLimiter, locationSseRoutes);

app.use("/api/notifications", authorise, notificationLimiter, notificationRoutes);
app.ws("/api/locations/livewebsocket", locationWsHandler);

// ── Swagger UI ────────────────────────────────────────────────────────────────
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger-output.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("BusNirikshan API is running"));

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startRedisSubscriber();

      // register this instance in Redis so /api/admin/system/instances can list it
  const { getPublisher } = require("./utils/pubsub");
  const pub = getPublisher();
  if (pub) {
    const instanceId = `instance:${process.env.HOSTNAME || "local"}-${Date.now()}`;
    pub.set(instanceId, JSON.stringify({
      instanceId,
      startedAt: new Date().toISOString(),
      port: PORT,
    }), "EX", 3600);
    app.locals.redisClient = pub;
  }
    });
  })
  .catch((err) => {
    console.error("Database connection error:", err);
    process.exit(1);
  });