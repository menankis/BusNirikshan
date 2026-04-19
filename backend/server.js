const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth")


const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);

dotenv.config();

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
