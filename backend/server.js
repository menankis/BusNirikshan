require("dotenv").config();
const express = require("express");
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

const app = express();

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
    });
  })
  .catch(err => {
    console.error('Database connection error:', err);
    process.exit(1);
  });
