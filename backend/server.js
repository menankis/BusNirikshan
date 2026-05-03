require("dotenv").config();
const express = require("express");
const expressWs = require("express-ws");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth")
const userRoutes = require("./routes/user")
const stopRoutes = require("./routes/stops")
const busRoutes = require("./routes/buses")
const locationRoutes = require("./routes/location")
const routeRoutes = require("./routes/routes")
const { locationWsHandler, startRedisSubscriber } = require("./routes/locationWs")

const app = express();
expressWs(app);   // patches app with app.ws() support

app.use(express.json());
app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));
app.use(morgan("dev"));
app.use(cookieParser())

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/stops", stopRoutes);
app.use("/api/buses", busRoutes)
app.use("/api/locations", locationRoutes)
app.use("/api/routes", routeRoutes)

// WebSocket endpoint — ws://host/api/locations/live
app.ws("/api/locations/live", locationWsHandler);

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI

app.get("/", (req, res) => {
    res.send("Hello World!");
});


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
