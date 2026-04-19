const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/user");
const dotenv = require("dotenv")

dotenv.config();

const router = express.Router();
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS, 10) || 10;

router.post("/register", async (req, res) => {
    const {name, email, password, role, rtc} = req.body;
    let passwordHash;

    if(await User.findOne({email})){
        return res.status(400).json({message: "User already exists"});
    }

    try{
        passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }catch(err){
        console.error(err);
        return res.status(500).json({message: "Internal server error"});
    }
    const user = new User({
        name,
        email,
        passwordHash,
        role,
        rtc
    });

    await user.save();
    res.status(201).json({message: "User created successfully"});


});

router.post("/login", async (req, res) => {

    const {email, password} = req.body;
    const user = await User.findOne({email});
    const isPasswordValid = await bcrypt.compare(password, user ? user.passwordHash : "");

    if(!user || !isPasswordValid){
        return res.status(401).json({message: "Invalid username or password"});
    }
    res.status(200).json({message: "Login successful"});
});



module.exports = router;
