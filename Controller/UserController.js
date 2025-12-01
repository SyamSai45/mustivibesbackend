import User from "../Models/User.js";
import { generateToken, verifyToken } from "../config/jwtToken.js";
import cloudinary from "../config/cloudinary.js";
import fs from "fs";

// ---------------------------------------------
// SEND OTP
// ---------------------------------------------
export const sendOtp = async (req, res) => {
    try {
        const { mobile } = req.body;

        if (!mobile) {
            return res.status(400).json({ message: "Mobile number required" });
        }

        const token = generateToken(mobile);
        const expiryTime = new Date(Date.now() + 5 * 60 * 1000);

        let user = await User.findOne({ mobile });

        if (!user) {
            user = await User.create({
                mobile,
                otp: "1234",
                token,
                expiresAt: expiryTime,
                hasCompletedProfile: false,
            });
        } else {
            user.otp = "1234";
            user.token = token;
            user.expiresAt = expiryTime;
            await user.save();
        }

        return res.json({
            success: true,
            message: "OTP sent successfully",
            token,
            otp: "1234"
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// ---------------------------------------------
// RESEND OTP
// ---------------------------------------------
export const resendOtp = async (req, res) => {
    try {
        const { mobile } = req.body;

        if (!mobile) {
            return res.status(400).json({ message: "Mobile number required" });
        }

        const user = await User.findOne({ mobile });
        if (!user) {
            return res.status(404).json({ message: "User not found for this mobile" });
        }

        const newToken = generateToken(mobile);
        const newExpiry = new Date(Date.now() + 5 * 60 * 1000);

        user.token = newToken;
        user.otp = "1234";
        user.expiresAt = newExpiry;

        await user.save();

        return res.json({
            success: true,
            message: "OTP resent successfully",
            token: newToken,
            otp: "1234"
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// ---------------------------------------------
// VERIFY OTP
// ---------------------------------------------
export const verifyOtp = async (req, res) => {
    try {
        const { token, otp } = req.body;

        if (!token || !otp) {
            return res.status(400).json({ message: "Token & OTP required" });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ message: "Token expired or invalid" });
        }

        const user = await User.findOne({ token });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.expiresAt < new Date()) {
            return res.status(400).json({ message: "OTP expired" });
        }

        if (otp !== "1234") {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // CASE-1: EXISTING USER (Profile completed)
        if (user.hasCompletedProfile === true) {
            const loginToken = generateToken({
                userId: user._id,
                mobile: user.mobile,
            });

            return res.json({
                success: true,
                message: "OTP verified. Existing user logged in.",
                isNewUser: false,
                goTo: "homePage",
                user,
                token: loginToken
            });
        }

        // CASE-2: NEW USER (Profile not completed)
        const setupToken = generateToken({
            userId: user._id,
            mobile: user.mobile
        });

        return res.json({
            success: true,
            message: "OTP verified. Continue to complete profile.",
            isNewUser: true,
            goTo: "uploadProfile",
            token: setupToken,
            userId: user._id
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// ----------------------------------------------------
// 📌 CREATE USER
// ----------------------------------------------------
export const createUser = async (req, res) => {
    try {
        const { mobile } = req.body;

        if (!mobile) {
            return res.status(400).json({ success: false, message: "Mobile is required" });
        }

        const existingUser = await User.findOne({ mobile });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists with this mobile number"
            });
        }

        const user = await User.create({ mobile });

        const token = generateToken({
            userId: user._id.toString(),
            mobile: user.mobile
        });

        return res.status(201).json({
            success: true,
            message: "User created successfully",
            user: {
                _id: user._id,
                mobile: user.mobile,
                hasCompletedProfile: false,
                hasLoggedIn: false
            },
            token,
            isNewUser: true
        });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ----------------------------------------------------
// 📌 UPLOAD USER PROFILE IMAGE
// ----------------------------------------------------
export const uploadUserProfileImage = async (req, res) => {
   try {
        const { userId } = req.params;
        const {
            name, nickname, gender, dob,
            referralCode, language, userType
        } = req.body;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No profile image uploaded. Use form-data key: profileImage"
            });
        }

        let uploadResponse;

        if (req.file.path) {
            uploadResponse = await cloudinary.uploader.upload(req.file.path, {
                folder: "userProfileImages",
                resource_type: "image"
            });

            try {
                fs.unlinkSync(req.file.path);
            } catch (e) {}
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        user.profileImage = uploadResponse.secure_url;
        if (name) user.name = name;
        if (nickname) user.nickname = nickname;
        if (gender) user.gender = gender;
        if (dob) user.dob = dob;
        if (referralCode) user.referralCode = referralCode;
        if (language) user.language = language;
        if (userType) user.userType = userType;

        user.hasCompletedProfile = true;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully. Now update location.",
            goTo: "updateLocation",
            user
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error updating profile",
            error: error.message
        });
    }
};

// ---------------------------------------------
// UPDATE LANGUAGE ONLY
// ---------------------------------------------
export const updateLanguage = async (req, res) => {
  try {
    const { userId } = req.params;
    const { language } = req.body;

    if (!language) {
      return res.status(400).json({
        success: false,
        message: "Language is required"
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    user.language = language;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Language updated successfully",
      user
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating language",
      error: error.message
    });
  }
};

// ----------------------------------------------------
// 📌 UPDATE USER LOCATION
// ----------------------------------------------------
export const updateUserLocation = async (req, res) => {
    try {
        const { userId, latitude, longitude } = req.body;

        if (!userId || latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                success: false,
                message: "userId, latitude & longitude required"
            });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                location: {
                    type: "Point",
                    coordinates: [parseFloat(longitude), parseFloat(latitude)]
                }
            },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: "User location stored successfully",
            location: updatedUser.location
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// ----------------------------------------------------
// 📌 GET USER LOCATION
// ----------------------------------------------------
export const getUserLocation = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);

        if (!user || !user.location) {
            return res.status(404).json({ success: false, message: "Location not found" });
        }

        const [longitude, latitude] = user.location.coordinates;

        return res.status(200).json({
            success: true,
            message: "User location fetched successfully",
            location: { latitude, longitude }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// GET USER BY ID
export const getUserById = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        return res.status(200).json({
            success: true,
            user
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// GET ALL USERS
export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: users.length,
            users
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// DELETE USER
export const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findByIdAndDelete(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "User deleted successfully"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
