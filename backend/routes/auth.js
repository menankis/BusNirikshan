const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/user");
const dotenv = require("dotenv")
const jwt = require("jsonwebtoken")

dotenv.config();

const router = express.Router();
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS, 10) || 10;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

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


    const access_token = jwt.sign({name: user.name,
                            email: user.email, 
                            role: user.role, 
                            rtc: user.rtc, 
                            isActive: user.isActive}, ACCESS_TOKEN_SECRET, {expiresIn: "15min"});

    const refresh_token = jwt.sign({email: user.email}, REFRESH_TOKEN_SECRET, {expiresIn: "7d"});


    res.status(200).json({message: "Login successful", access_token: access_token, refresh_token: refresh_token});
});



module.exports = router;
