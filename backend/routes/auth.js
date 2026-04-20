const express = require("express");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv")
const jwt = require("jsonwebtoken")

const User = require("../models/user");
const RefreshToken = require("../models/refreshtoken")

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


    const access_token = jwt.sign({userId: user._id,
                            name: user.name,
                            email: user.email, 
                            role: user.role, 
                            rtc: user.rtc, 
                            isActive: user.isActive}, ACCESS_TOKEN_SECRET, {expiresIn: "15min"});

    const refresh_token = jwt.sign({userId: user._id, email: user.email}, REFRESH_TOKEN_SECRET, {expiresIn: "7d"});
    
    await RefreshToken.updateOne(
        { userId: user._id},
        {
          email: user.email,
          token: refresh_token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        },
        { upsert: true, new: true }
    );


    res.cookie("refresh_token", refresh_token, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({message: "Login successful", access_token: access_token});
});


router.post("/logout", async (req, res) => {
    const refresh_token = req.cookies.refresh_token;
    if(!refresh_token){
        return res.status(401).json({message: "No refresh token found"});
    }
    await RefreshToken.deleteOne({token: refresh_token});
    res.clearCookie("refresh_token");
    res.status(200).json({message: "Logout successful"});
});


router.post("/refresh", async (req, res) => {
    const refresh_token = req.cookies.refresh_token;
    if(!refresh_token){
        return res.status(401).json({message: "No refresh token found"});
    }
    
    const tokenDoc = await RefreshToken.findOne({token: refresh_token});
    if(!tokenDoc){
        return res.status(403).json({message: "Invalid refresh token"});
    }

    try {
        const decoded = jwt.verify(refresh_token, REFRESH_TOKEN_SECRET);
        
        const user = await User.findById(decoded.userId);
        if(!user) {
            return res.status(403).json({message: "User not found"});
        }

        const new_access_token = jwt.sign({
            userId: user._id,
            name: user.name,
            email: user.email, 
            role: user.role, 
            rtc: user.rtc, 
            isActive: user.isActive
        }, ACCESS_TOKEN_SECRET, {expiresIn: "15min"});

        const new_refresh_token = jwt.sign({userId: user._id, email: user.email}, REFRESH_TOKEN_SECRET, {expiresIn: "7d"});
        
        await RefreshToken.updateOne(
            { userId: user._id },
            {
              email: user.email,
              token: new_refresh_token,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            },
            { upsert: true, new: true }
        );

        res.cookie("refresh_token", new_refresh_token, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.status(200).json({
            message: "Token refreshed successfully", 
            access_token: new_access_token
        });
    } catch (err) {
        console.error(err);
        return res.status(403).json({message: "Invalid or expired refresh token"});
    }
});

module.exports = router;
