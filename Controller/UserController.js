import User from "../Models/User.js";
import { generateToken, verifyToken } from "../config/jwtToken.js";
import cloudinary from "../config/cloudinary.js";
import fs from "fs";
import nodemailer from 'nodemailer';
import { sendSms } from "../config/sendSms.js";
import { randomBytes } from "crypto";
import CommunicationRequest from "../Models/CommunicationRequest.js";
import AppFeedback from "../Models/AppFeedback.js";
import Calling from "../Models/Calling.js";
import {sendPushNotification} from "../utils/sendPushNotification.js"
import sendSimplePush from "../utils/sendSimplePush.js";
    import crypto from "crypto";
    import axios from "axios";
    import zegoService from '../config/zego-service.js';
import Admin from "../Models/Admin.js";
import Redeem from "../Models/Redeem.js";
import CoinToRupee from "../Models/CoinToRupee.js";
import AdminSettings from "../Models/AdminSettings.js";
// Add at top with other imports
import createAdminNotification from "../utils/AdminNotificationService.js";


// // Helper function to create admin notifications
// const createAdminNotification = async ({
//   title,
//   body,
//   type,
//   relatedUser = null,
//   relatedData = {},
//   priority = 'medium'
// }) => {
//   try {
//     const notification = await AdminNotification.create({
//       title,
//       body,
//       type,
//       relatedUser,
//       relatedData,
//       priority,
//       isRead: false
//     });
    
//     console.log(`✅ Admin notification created: ${type} - ${title}`);
    
//     // Optional: Emit socket event for real-time admin dashboard
//     const io = req?.app?.get("io");
//     if (io) {
//       io.to('admin-room').emit('new-admin-notification', notification);
//     }
    
//     return notification;
//   } catch (error) {
//     console.error('❌ Error creating admin notification:', error);
//     return null;
//   }
// };


// ✅ Add this helper function at the top (after imports)
const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : user;
  delete userObj.referralUsedBy;  // Remove referralUsedBy
  return userObj;
};

// Add this helper function at the top (after imports)
const generateUniqueReferralCode = async () => {
  let code;
  let exists = true;

  while (exists) {
    // Generate 8-character alphanumeric code
    code = randomBytes(4).toString('hex').toUpperCase(); // e.g., "A3B5C7D9"
    // ✅ FIXED: Check myReferralCode instead of referralCode
    exists = await User.findOne({ myReferralCode: code });
  }

  return code;
};

// ================= EMAIL SETUP =================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'pms226803@gmail.com',
    pass: 'nrasbifqxsxzurrm',
  },
  tls: { rejectUnauthorized: false }
});


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
    const { token, otp, fcmToken } = req.body;  // ✅ fcmToken add

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

    // ✅ Update FCM token if provided
    if (fcmToken) {
      user.fcmToken = fcmToken;
      await user.save();
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
    const { mobile, fcmToken } = req.body; // ✅ fcmToken add

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

    const user = await User.create({ mobile, fcmToken }); // ✅ store fcmToken
    // ✅ ADMIN NOTIFICATION: New user registered
    await createAdminNotification({
      title: "🆕 New User Registered",
      body: `New user registered with mobile: ${mobile}`,
      type: 'new_user',
      relatedUser: user._id,
      relatedData: {
        mobile: user.mobile,
        createdAt: user.createdAt
      },
      priority: 'medium'
    });
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
        hasLoggedIn: false,
        fcmToken: user.fcmToken // ✅ return stored fcmToken
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
export const uploadUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, nickname, gender, dob, referralCode, language, userType } = req.body;

    // Check if profile image is uploaded using Multer
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No profile image uploaded. Use form-data key: profileImage"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ✅ Referral code validation (if provided)
    if (referralCode) {
      if (user.hasUsedReferral) {
        return res.status(400).json({
          success: false,
          message: "You have already used a referral code. Each user can only use one referral code."
        });
      }

      const referrer = await User.findOne({ myReferralCode: referralCode });

      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: "Invalid referral code. This code does not exist."
        });
      }

      if (referrer.referralUsedBy.includes(userId)) {
        return res.status(400).json({
          success: false,
          message: "You have already used this referral code."
        });
      }

      // ✅ Get admin settings for referral reward coins
      let settings = await AdminSettings.findOne();
      let rewardCoins = settings?.referralRewardCoins || 0;

      // ✅ Add coins to wallet + totalCoins
      user.wallet += rewardCoins;
      user.totalCoins += rewardCoins;

      referrer.wallet += rewardCoins;
      referrer.totalCoins += rewardCoins;

      // ✅ Check if referrer is female and add extra reward to myreferredrewarded
      if (referrer.gender === 'female') {
        referrer.myreferredrewarded += rewardCoins;
        console.log(`🎀 Female referrer got ${rewardCoins} coins in myreferredrewarded`);
      }

      user.usedReferralCode = referralCode;
      user.hasUsedReferral = true;

      referrer.referralUsedBy.push(userId);

      // ✅ Add transaction history for the user (using referral code)
      if (!user.transactionhistyry) {
        user.transactionhistyry = [];
      }
      user.transactionhistyry.push({
        type: "credited",
        coins: rewardCoins,
        amount: 0,
        description: `Referral bonus using code ${referralCode}`,
        createdAt: new Date()
      });

      // ✅ Add transaction history for referrer (whose referral code is used)
      if (!referrer.transactionhistyry) {
        referrer.transactionhistyry = [];
      }
      referrer.transactionhistyry.push({
        type: "credited",
        coins: rewardCoins,
        amount: 0,
        description: `Referral reward from ${user.name || user.mobile}`,
        createdAt: new Date()
      });

      await referrer.save();
    }

    // Save uploaded profile image path to the user model
user.profileImage = `http://31.97.206.144:4055/uploads/${req.file.filename}`; // Save full URL with base URL
    if (name) user.name = name;
    if (nickname) user.nickname = nickname;
    if (gender) user.gender = gender;
    if (dob) user.dob = dob;
    if (language) user.language = language;
    if (userType) user.userType = userType;

    if (!user.myReferralCode) {
      user.myReferralCode = await generateUniqueReferralCode();
    }

    user.hasCompletedProfile = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully. Now update location.",
      goTo: "updateLocation",
      user: user  // Optionally sanitize user here if needed
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message
    });
  }
};
// ----------------------------------------------------
// 📌 GET USER PROFILE DETAILS (including profileImage)
// ----------------------------------------------------
export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId missing in URL params"
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully",
      user
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching profile",
      error: error.message
    });
  }
};


// ----------------------------------------------------
// 📌 DELETE USER PROFILE IMAGE ONLY
// ----------------------------------------------------
export const deleteUserProfileImage = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId missing in URL params"
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.profileImage) {
      return res.status(400).json({
        success: false,
        message: "No profile image found to delete"
      });
    }

    // 🔥 Extract Cloudinary public_id from URL
    const publicId = user.profileImage
      .split("/")
      .slice(-1)[0]
      .split(".")[0];

    // 🔥 Delete from Cloudinary
    await cloudinary.uploader.destroy(`userProfileImages/${publicId}`);

    // 🔥 Remove only image from DB
    user.profileImage = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile image deleted successfully"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error deleting profile image",
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

// ----------------------------------------------------
// 📌 UPDATE USER PROFILE IMAGE (using userId in params)
// form-data key → profileImage
// ----------------------------------------------------
export const updateUserProfileImage = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1️⃣ Check userId
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId missing in URL params"
      });
    }

    // 2️⃣ Check file upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message:
          "No file uploaded. Postman Cloud URLs are NOT supported. Upload a real file using 'Choose File' and key: profileImage"
      });
    }

    // 3️⃣ Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 4️⃣ Upload to Cloudinary
    const upload = await cloudinary.uploader.upload(req.file.path, {
      folder: "userProfileImages"
    });

    // 5️⃣ Remove temp file
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) { }

    // 6️⃣ Save updated image
    user.profileImage = upload.secure_url;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile image updated successfully",
      user
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};





// ====================== FOLLOW USER ======================
export const followUser = async (req, res) => {
  try {
    const { userId, followId } = req.body;

    // Basic validation
    if (!userId || !followId || userId === followId) {
      return res.status(400).json({ success: false, message: "Invalid userId or followId" });
    }

    // Find the user and the user to follow
    const user = await User.findById(userId).select("name following notifications");
    const followUser = await User.findById(followId).select("name followers fcmToken notifications");

    if (!user || !followUser) return res.status(404).json({ success: false, message: "User not found" });

    // Check if already following
    if (user.following.includes(followId))
      return res.status(400).json({ success: false, message: `Already following ${followUser.name}` });

    // Add to following and followers list
    await User.updateOne({ _id: userId }, { $addToSet: { following: followId } });
    await User.updateOne({ _id: followId }, { $addToSet: { followers: userId } });

    // Create notification messages for both users
    const followNotificationForFollowedUser = {
      title: "New Follower 🎉",
      body: `${user.name} started following you`,
      type: "follow",
      createdAt: new Date(),
    };

    const followNotificationForUser = {
      title: "You followed someone 🎉",
      body: `You started following ${followUser.name}`,
      type: "follow",
      createdAt: new Date(),
    };

    // Push notification to the followUser's notifications array (the person being followed)
    await User.updateOne({ _id: followId }, { $push: { notifications: followNotificationForFollowedUser } });
    
    // Push notification to the user's notifications array (the person following)
    await User.updateOne({ _id: userId }, { $push: { notifications: followNotificationForUser } });

    // Send Push Notification to the followUser only (the one who is followed)
    if (followUser.fcmToken) {
      await sendSimplePush({
        fcmToken: followUser.fcmToken,
        title: "New Follower 🎉",
        body: `${user.name} started following you`,
        data: { type: "follow", userId: userId.toString() },
      });
    }

    // Return success response with the name of the followed user
    return res.status(200).json({ 
      success: true, 
      message: `You followed ${followUser.name} successfully`,
      followedUser: followUser.name, // To show which user was followed
    });

  } catch (error) {
    console.error("❌ followUser error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ====================== UNFOLLOW USER ====================== */
export const unfollowUser = async (req, res) => {
  try {
    const { userId, followId } = req.body;

    // Basic validation
    if (!userId || !followId) return res.status(400).json({ success: false, message: "userId and followId required" });

    // Find the user and the user to unfollow
    const user = await User.findById(userId).select("name following notifications");
    const followUser = await User.findById(followId).select("name followers fcmToken notifications");

    if (!user || !followUser) return res.status(404).json({ success: false, message: "User not found" });

    // Check if the user is following the followUser
    if (!user.following.includes(followId))
      return res.status(400).json({ success: false, message: `You are not following ${followUser.name}` });

    // Remove from following and followers list
    await User.updateOne({ _id: userId }, { $pull: { following: followId } });
    await User.updateOne({ _id: followId }, { $pull: { followers: userId } });

    // Create notification messages for both users
    const unfollowNotificationForFollowedUser = {
      title: "Unfollowed 😞",
      body: `${user.name} unfollowed you`,
      type: "unfollow",
      createdAt: new Date(),
    };

    const unfollowNotificationForUser = {
      title: "You unfollowed someone 😞",
      body: `You unfollowed ${followUser.name}`,
      type: "unfollow",
      createdAt: new Date(),
    };

    // Push notification to the followUser's notifications array (the person being unfollowed)
    await User.updateOne({ _id: followId }, { $push: { notifications: unfollowNotificationForFollowedUser } });
    
    // Push notification to the user's notifications array (the person unfollowing)
    await User.updateOne({ _id: userId }, { $push: { notifications: unfollowNotificationForUser } });

    // Send Push Notification to the followUser only (the one who is unfollowed)
    if (followUser.fcmToken) {
      await sendSimplePush({
        fcmToken: followUser.fcmToken,
        title: "Unfollowed 😞",
        body: `${user.name} unfollowed you`,
        data: { type: "unfollow", userId: userId.toString() },
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: `You unfollowed ${followUser.name} successfully`,
      unfollowedUser: followUser.name, // To show which user was unfollowed
    });

  } catch (error) {
    console.error("❌ unfollowUser error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getFollowersAndFollowing = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate("followers", "name nickname mobile profileImage language status")
      .populate("following", "name nickname mobile profileImage language status");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // helper for name priority
    const formatUser = (u) => ({
      _id: u._id,
      name:
        u.name && u.name.trim() !== ""
          ? u.name
          : u.nickname
            ? u.nickname
            : u.mobile,
      profileImage: u.profileImage || null,
      language: u.language || null,
      status: u.status || "active"
    });

    return res.status(200).json({
      success: true,

      followersCount: user.followers.length,
      followingCount: user.following.length,

      followers: user.followers.map(formatUser),
      following: user.following.map(formatUser)
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



export const findFriends = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId required"
      });
    }

    const user = await User.findById(userId)
      .populate("followers", "name nickname mobile profileImage")
      .populate("following", "name nickname mobile profileImage");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // -----------------------------------
    // FRIENDS HISTORY (followers + following)
    // -----------------------------------
    let historySet = new Set();
    user.followers?.forEach(u => historySet.add(u._id.toString()));
    user.following?.forEach(u => historySet.add(u._id.toString()));

    const historyUsers = await User.find({
      _id: { $in: Array.from(historySet) }
    }).select("name nickname mobile profileImage");

    const formatUser = (u, isFriend) => ({
      _id: u._id,
      name: u.name?.trim() !== "" ? u.name : (u.nickname || u.mobile),
      profileImage: u.profileImage,
      isFriend
    });

    const friendsHistory = historyUsers.map(u =>
      formatUser(u, true)
    );

    // -----------------------------------
    // NEW FRIEND SUGGESTION USERS
    // -----------------------------------
    const randomUsers = await User.find({
      _id: { $ne: userId, $nin: Array.from(historySet) }
    })
      .select("name nickname mobile profileImage")
      .limit(20);

    const newFriends = randomUsers.map(u =>
      formatUser(u, false)
    );

    return res.status(200).json({
      success: true,
      message: "Friends and new suggested friends fetched successfully",
      friendsHistory,
      newFriends
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// ---------------------------------------------
// DELETE MY ACCOUNT (APP & WEBSITE)
// ---------------------------------------------
export const deleteMyAccount = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 🔥 DELETE RELATED DATA (IMPORTANT)
    await Room.deleteMany({ userId });
    await Moderation.deleteMany({
      $or: [
        { reportedBy: userId },
        { reportedUser: userId }
      ]
    });

    // 🔥 REMOVE USER FROM FOLLOWERS/FOLLOWING
    await User.updateMany(
      { followers: userId },
      { $pull: { followers: userId } }
    );

    await User.updateMany(
      { following: userId },
      { $pull: { following: userId } }
    );

    // 🔥 DELETE USER PERMANENTLY
    await User.findByIdAndDelete(userId);

    return res.status(200).json({
      success: true,
      message: "Account permanently deleted successfully",
      goTo: "signup"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// =================================================
// REQUEST DELETE ACCOUNT (SEND CONFIRM LINK VIA SMS)
// ================================================

export const deleteAccountByMobile = async (req, res) => {
  const { mobile, reason } = req.body;

  if (!mobile || !reason) {
    return res.status(400).json({
      success: false,
      message: "Mobile number and reason are required"
    });
  }

  try {
    const user = await User.findOne({ mobile });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // ✅ FIXED
    const token = randomBytes(32).toString("hex");

    user.deleteToken = token;
    user.deleteTokenExpiration = Date.now() + 60 * 60 * 1000;
    await user.save();

    const deleteLink = `${process.env.BASE_URL}/confirm-delete-account/${token}`;

    const smsMessage = `
mastivides Account Deletion

Reason: ${reason}

Confirm deletion (valid for 1 hour):
${deleteLink}

If not requested, ignore this SMS.
`;


    await sendSms(mobile, smsMessage);

    return res.status(200).json({
      success: true,
      message: "Delete confirmation link sent to your mobile number"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// =================================================
// CONFIRM & PERMANENTLY DELETE ACCOUNT
// =================================================
export const confirmDeleteAccount = async (req, res) => {
  const { token } = req.params;

  try {
    const user = await User.findOne({
      deleteToken: token,
      deleteTokenExpiration: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired delete link"
      });
    }

    await User.findByIdAndDelete(user._id);

    return res.status(200).json({
      success: true,
      message: "Your mastivibes account has been permanently deleted"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ---------------------------------------------
   CREATE COMMUNICATION REQUEST
--------------------------------------------- */
// ---------------- CREATE COMMUNICATION REQUEST ----------------
export const createRequest = async (req, res) => {
  try {
    const { fromUser, toUser, type } = req.body;

    // 1️⃣ Validation
    if (!fromUser || !toUser || !type) {
      return res.status(400).json({
        success: false,
        message: "fromUser, toUser, and type are required"
      });
    }

    if (fromUser === toUser) {
      return res.status(400).json({
        success: false,
        message: "Cannot send request to yourself"
      });
    }

    // 2️⃣ Check if request already exists
    const exists = await CommunicationRequest.findOne({
      fromUser,
      toUser,
      type
    });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Request already exists",
        status: exists.status
      });
    }

    // 3️⃣ Fetch users for notification
    const sender = await User.findById(fromUser).select("name fcmToken");
    const receiver = await User.findById(toUser).select("name fcmToken");

    if (!sender || !receiver) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 4️⃣ Create communication request in DB
    const request = await CommunicationRequest.create({
      fromUser,
      toUser,
      type,
      status: "pending", // default
    });

    // 5️⃣ Send FCM notification to receiver
    if (receiver.fcmToken) {
      await sendSimplePush({
        fcmToken: receiver.fcmToken,
        title: `${sender.name} sent you a ${type} request`,
        body: `You have a new ${type} request from ${sender.name}`,
        data: {
          type: "communication_request",
          requestId: request._id.toString(),
          fromUser: fromUser.toString(),
          toUser: toUser.toString(),
        }
      });
    }

    return res.status(201).json({
      success: true,
      message: "Communication request sent successfully",
      request
    });

  } catch (error) {
    console.error("❌ createRequest error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// GET ALL COMMUNICATION REQUESTS (ADMIN / DEBUG)
export const getAllRequests = async (req, res) => {
  try {
    const requests = await CommunicationRequest.find()
      .populate("fromUser", "name mobile profileImage")
      .populate("toUser", "name mobile profileImage")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ---------------------------------------------
   GET ALL REQUESTS FOR USER
--------------------------------------------- */
export const getMyRequests = async (req, res) => {
  try {
    const { userId } = req.params;

    const requests = await CommunicationRequest.find({
      toUser: userId
    })
      .populate("fromUser", "name mobile profileImage")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ---------------------------------------------
   APPROVE / REJECT REQUEST
--------------------------------------------- */
// ---------------- HANDLE REQUEST ----------------
export const handleRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action } = req.body;

    // 1️⃣ Fetch request
    const request = await CommunicationRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found"
      });
    }

    if (request.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "User is blocked"
      });
    }

    // 2️⃣ Determine new status
    let newStatus;
    if (action === "approve") {
      newStatus = "approved";
    } else if (action === "reject") {
      newStatus = "rejected";
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid action"
      });
    }

    request.status = newStatus;
    await request.save();

    // 3️⃣ Fetch sender for push notification
    const sender = await User.findById(request.fromUser).select("name fcmToken");
    const receiver = await User.findById(request.toUser).select("name");

    if (sender && sender.fcmToken) {
      await sendSimplePush({
        fcmToken: sender.fcmToken,
        title: `Your request was ${newStatus}`,
        body: `${receiver.name} has ${newStatus} your ${request.type} request`,
        data: {
          type: "communication_request_update",
          requestId: request._id.toString(),
          status: newStatus,
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: `Request ${newStatus}`,
      request
    });

  } catch (error) {
    console.error("❌ handleRequest error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ---------------------------------------------
   BLOCK USER
--------------------------------------------- */
// Block User Controller
export const blockUser = async (req, res) => {
  try {
    const { fromUser, toUser } = req.body;

    if (!fromUser || !toUser) {
      return res.status(400).json({
        success: false,
        message: "fromUser and toUser are required"
      });
    }

    if (fromUser === toUser) {
      return res.status(400).json({
        success: false,
        message: "You cannot block yourself"
      });
    }

    let request = await CommunicationRequest.findOne({
      fromUser,
      toUser,
      type: "chat"
    });

    // ✅ Update if exists
    if (request) {
      request.isBlocked = true;
      request.status = "rejected";
      await request.save();
    }
    // ✅ Create if not exists
    else {
      request = await CommunicationRequest.create({
        fromUser,
        toUser,
        type: "chat",
        status: "rejected",
        isBlocked: true
      });
    }

    // Fetch the toUser to send push notification
    const blockedUser = await User.findById(toUser).select("name fcmToken notifications");

    if (blockedUser && blockedUser.fcmToken) {
      // Push Notification to the blocked user
      await sendSimplePush({
        fcmToken: blockedUser.fcmToken,
        title: "You were blocked 🚫",
        body: `${fromUser.name} has blocked you`,
        data: { type: "block", fromUser: fromUser.toString() },
      });

      // Create a notification for the blocked user
      const blockNotification = {
        title: "You were blocked 🚫",
        body: `${fromUser.name} has blocked you`,
        type: "block",
        createdAt: new Date(),
      };

      // Push the notification to the blocked user's notifications
      await User.updateOne(
        { _id: toUser },
        { $push: { notifications: blockNotification } }
      );
    }

    // Create a notification for the fromUser (who is doing the blocking)
    const blockConfirmationNotification = {
      title: "User Blocked",
      body: `You have successfully blocked ${blockedUser.name}`,
      type: "block",
      createdAt: new Date(),
    };

    // Push the notification to the fromUser's notifications
    await User.updateOne(
      { _id: fromUser },
      { $push: { notifications: blockConfirmationNotification } }
    );

    return res.status(200).json({
      success: true,
      message: "User blocked successfully",
      request
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Unblock User Controller
export const unblockUser = async (req, res) => {
  try {
    const { fromUser, toUser } = req.body;

    if (!fromUser || !toUser) {
      return res.status(400).json({
        success: false,
        message: "fromUser and toUser are required"
      });
    }

    const request = await CommunicationRequest.findOne({
      fromUser,
      toUser,
      type: "chat"
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Blocked request not found"
      });
    }

    request.isBlocked = false;
    request.status = "pending"; // optional reset
    await request.save();

    // Fetch the toUser to send push notification
    const unblockedUser = await User.findById(toUser).select("name fcmToken notifications");

    if (unblockedUser && unblockedUser.fcmToken) {
      // Push Notification to the unblocked user
      await sendSimplePush({
        fcmToken: unblockedUser.fcmToken,
        title: "You were unblocked 💬",
        body: `${fromUser.name} has unblocked you`,
        data: { type: "unblock", fromUser: fromUser.toString() },
      });

      // Create a notification for the unblocked user
      const unblockNotification = {
        title: "You were unblocked 💬",
        body: `${fromUser.name} has unblocked you`,
        type: "unblock",
        createdAt: new Date(),
      };

      // Push the notification to the unblocked user's notifications
      await User.updateOne(
        { _id: toUser },
        { $push: { notifications: unblockNotification } }
      );
    }

    // Create a notification for the fromUser (who is doing the unblocking)
    const unblockConfirmationNotification = {
      title: "User Unblocked",
      body: `You have successfully unblocked ${unblockedUser.name}`,
      type: "unblock",
      createdAt: new Date(),
    };

    // Push the notification to the fromUser's notifications
    await User.updateOne(
      { _id: fromUser },
      { $push: { notifications: unblockConfirmationNotification } }
    );

    return res.status(200).json({
      success: true,
      message: "User unblocked successfully",
      request
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ---------------------------------------------
   DELETE REQUEST (CRUD)
--------------------------------------------- */
export const deleteRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    await CommunicationRequest.findByIdAndDelete(requestId);

    return res.status(200).json({
      success: true,
      message: "Request deleted"
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllBlockedUsers = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    const blockedRequests = await CommunicationRequest.find({
      isBlocked: true,
      $or: [
        { fromUser: userId },
        { toUser: userId }
      ]
    })
      .populate("fromUser", "name nickname mobile profileImage")
      .populate("toUser", "name nickname mobile profileImage")
      .sort({ updatedAt: -1 });

    const blockedUsers = blockedRequests.map((req) => {
      const blockedByMe = req.fromUser._id.toString() === userId;
      const blockedUser = blockedByMe ? req.toUser : req.fromUser;

      return {
        requestId: req._id,
        blockedUser: {
          _id: blockedUser._id,
          name:
            blockedUser.name?.trim() !== ""
              ? blockedUser.name
              : blockedUser.nickname || blockedUser.mobile,
          profileImage: blockedUser.profileImage || null,
          mobile: blockedUser.mobile
        },
        blockedByMe,
        status: req.status,
        type: req.type,
        blockedAt: req.updatedAt
      };
    });

    return res.status(200).json({
      success: true,
      count: blockedUsers.length,
      blockedUsers
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ================= GET WALLET ================= */
export const getMyWallet = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("wallet");
    if (!user) return res.status(404).json({ success: false });

    res.json({
      success: true,
      wallet: user.wallet
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


/* ==============================
   CREATE FEEDBACK (ONLY ONCE)
================================ */
export const createFeedback = async (req, res) => {
  try {
    const { userId, rating, experience } = req.body;

    if (!userId || !rating || !experience) {
      return res.status(400).json({
        success: false,
        message: "userId, rating and experience are required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const existingFeedback = await AppFeedback.findOne({ user: userId });
    if (existingFeedback) {
      return res.status(409).json({
        success: false,
        message: "Feedback already submitted. You can update it."
      });
    }

    const feedback = await AppFeedback.create({
      user: userId,
      rating,
      experience
    });

        // ✅ ADMIN NOTIFICATION: New feedback submitted
    await createAdminNotification({
      title: "📝 New Feedback Received",
      body: `${user.name || user.mobile} submitted feedback with rating: ${rating}/5`,
      type: 'feedback_submitted',
      relatedUser: userId,
      relatedData: {
        feedbackId: feedback._id,
        rating,
        experience,
        createdAt: feedback.createdAt
      },
      priority: 'low'
    });

    return res.status(201).json({
      success: true,
      message: "Feedback submitted successfully",
      feedback
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ==============================
   GET MY FEEDBACK
================================ */
export const getMyFeedback = async (req, res) => {
  try {
    const { userId } = req.params;

    const feedback = await AppFeedback.findOne({ user: userId })
      .populate("user", "name nickname profileImage");

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found"
      });
    }

    return res.status(200).json({
      success: true,
      feedback
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ==============================
   GET ALL FEEDBACK (ADMIN / APP)
================================ */
export const getAllFeedbacks = async (req, res) => {
  try {
    const feedbacks = await AppFeedback.find()
      .populate("user", "name nickname profileImage")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: feedbacks.length,
      feedbacks
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ==============================
   UPDATE FEEDBACK
================================ */
export const updateFeedback = async (req, res) => {
  try {
    const { userId } = req.params;
    const { rating, experience } = req.body;

    const feedback = await AppFeedback.findOne({ user: userId });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found"
      });
    }

    if (rating) feedback.rating = rating;
    if (experience) feedback.experience = experience;

    await feedback.save();

    return res.status(200).json({
      success: true,
      message: "Feedback updated successfully",
      feedback
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ==============================
   DELETE FEEDBACK
================================ */
export const deleteFeedback = async (req, res) => {
  try {
    const { userId } = req.params;

    const feedback = await AppFeedback.findOneAndDelete({ user: userId });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Feedback deleted successfully"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



//////////////////////   calling flow ////////////////////////////////



// const ZEGO_APP_ID = "1837791744";
// const ZEGO_SERVER_SECRET = "f45d2d08b7c9085571347535acf61177";
// const MIN_COINS = 1;
// const BILL_INTERVAL = 60 * 1000; // 1 minute
// const POLL_INTERVAL = 5000; // 5 seconds
// const CALL_TIMEOUT = 60 * 1000; // 1 minute

const ZEGO_APP_ID = "1837791744";
const ZEGO_SERVER_SECRET = "f45d2d08b7c9085571347535acf61177";

// ---------------- CONFIG ----------------
const MIN_COINS = 1;
const POLL_INTERVAL = 3000; // 3 sec
const CALL_TIMEOUT = 60000; // 60 sec
const BILL_INTERVAL = 60000; // 1 min
const COINS_PER_MINUTE = 10; // 1 मिनट के 10 coins
const FEMALE_PERCENTAGE = 60; // Female को 60% coins
const ADMIN_PERCENTAGE = 40; // Admin को 40% coins

// Store active intervals
const activeIntervals = new Map();
const billingTimers = new Map();
const activeCallTimeouts = new Map();

// Global intervals storage
const activePerMinuteIntervals = new Map();

// Helper function: Transaction history में add करने के लिए
const addTransactionToHistory = async (userId, type, coins, amount = 0, description = "") => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    if (!user.transactionhistory) {
      user.transactionhistory = [];
    }

    user.transactionhistory.push({
      type: type,
      coins: coins,
      amount: amount,
      description: description,
      createdAt: new Date()
    });

    // Limit transaction history to last 100 records
    if (user.transactionhistory.length > 100) {
      user.transactionhistory = user.transactionhistory.slice(-100);
    }

    await user.save();
    console.log(`✅ Transaction added to user history: ${type} ${coins} coins for user ${userId}`);
  } catch (error) {
    console.error(`❌ Error adding user transaction history: ${error.message}`);
  }
};

// Helper function: Admin wallet में add करने के लिए
const addToAdminWallet = async (coins, description, userId = null, callId = null) => {
  try {
    // Get or create admin account
    let admin = await Admin.findOne({});
    
    if (!admin) {
      // पहली बार में admin account create करें
      admin = await Admin.create({
        email: 'admin@system.com',
        wallet: coins,
        transactionHistory: [{
          type: "credited",
          coins: coins,
          amount: 0,
          description: description || "Initial coins from system",
          userId: userId,
          callId: callId,
          createdAt: new Date()
        }]
      });
      console.log(`✅ Admin account created with initial ${coins} coins`);
    } else {
      // Existing admin में coins add करें
      admin.wallet += coins;
      
      // Add transaction history to admin
      admin.transactionHistory.push({
        type: "credited",
        coins: coins,
        amount: 0,
        description: description,
        userId: userId,
        callId: callId,
        createdAt: new Date()
      });
      
      // Limit transaction history
      if (admin.transactionHistory.length > 1000) {
        admin.transactionHistory = admin.transactionHistory.slice(-1000);
      }
    }
    
    await admin.save();
    console.log(`💰 Admin wallet credited: ${coins} coins | New balance: ${admin.wallet}`);
    return admin;
  } catch (error) {
    console.error(`❌ Error adding to admin wallet: ${error.message}`);
    
    // Error case में भी admin account create करने की कोशिश करें
    try {
      const admin = await Admin.create({
        email: 'admin@system.com',
        wallet: coins
      });
      console.log(`✅ Admin account created after error with ${coins} coins`);
      return admin;
    } catch (createError) {
      console.error(`❌ Failed to create admin account: ${createError.message}`);
      return null;
    }
  }
};

// Helper function: Admin balance check करने के लिए
const getAdminBalance = async () => {
  try {
    const admin = await Admin.findOne({});
    if (!admin) {
      // अगर admin नहीं मिला तो create करें
      const newAdmin = await Admin.create({
        email: 'admin@system.com',
        wallet: 0
      });
      return 0;
    }
    return admin.wallet;
  } catch (error) {
    console.error(`❌ Error getting admin balance: ${error.message}`);
    return 0;
  }
};

// Helper function: Push notification send करने के लिए
const sendRechargeNotification = async (userId, coinsNeeded) => {
  try {
    const user = await User.findById(userId);
    if (user && user.fcmToken) {
      // 1. पहला notification: Recharge करने के लिए
      await sendPushNotification({
        fcmToken: user.fcmToken,
        callId: "system",
        senderId: "system",
        receiverId: userId,
        callerId: "system",
        callerName: "System",
        callType: "notification",
        callStatus: "RECHARGE_REQUIRED",
        message: `You need ${coinsNeeded} more coins to continue the call. Please recharge your account.`
      });
      console.log(`📱 Recharge notification sent to user ${userId}`);
      
      // 2. दूसरा notification: Call ended हो गया
      await sendPushNotification({
        fcmToken: user.fcmToken,
        callId: "system",
        senderId: "system",
        receiverId: userId,
        callerId: "system",
        callerName: "System",
        callType: "notification",
        callStatus: "CALL_ENDED_NO_COINS",
        message: `Your call has ended due to insufficient coins. Please recharge to continue calling.`
      });
      console.log(`📱 Call ended notification sent to user ${userId}`);
    }
  } catch (error) {
    console.error(`❌ Error sending recharge notification: ${error.message}`);
  }
};



// Helper function: Real-time में call end करने के लिए
const endCallDueToInsufficientCoins = async (call, sender, remainingCoins) => {
  try {
    console.log(`⚠️ Ending call ${call._id} due to insufficient coins`);
    
    // Update call status
    call.status = "ENDED";
    call.type = "call_ended_no_coins";
    call.endedAt = new Date();
    
    // Calculate duration
    if (call.startedAt) {
      const durationSeconds = Math.floor((call.endedAt - call.startedAt) / 1000);
      call.duration = durationSeconds;
    }
    
    await call.save();
    
    // Send notifications to both users
    const receiver = await User.findById(call.receiverId);
    
    // Send to sender
    if (sender && sender.fcmToken) {
      await sendRechargeNotification(sender._id, remainingCoins);
      console.log(`📱 Notifications sent to sender`);
    }
    
    // Send to receiver (optional)
    if (receiver && receiver.fcmToken) {
      await sendPushNotification({
        fcmToken: receiver.fcmToken,
        callId: call._id.toString(),
        senderId: call.senderId,
        receiverId: call.receiverId,
        callerId: call.senderId,
        callerName: call.callerName,
        callType: call.callType,
        callStatus: "CALL_ENDED_NO_COINS",
        message: "Call ended - Partner has insufficient coins"
      });
      console.log(`📱 Call ended notification sent to receiver`);
    }
    
    // 🔥 IMPORTANT: Force close the Zego room
    // यहाँ आपको Zego API call करना होगा room close करने के लिए
    console.log(`🔥 Call ${call._id} ended due to insufficient coins`);
    
    return true;
  } catch (error) {
    console.error(`❌ Error ending call: ${error.message}`);
    return false;
  }
};



// New function: Send per-minute notification
const sendPerMinuteNotification = async (call, sender, remainingMinutes, remainingCoinsNeeded) => {
  try {
    if (!sender || !sender.fcmToken) return;
    
    const receiver = await User.findById(call.receiverId);
    
    // Send notification to BOTH users
    const users = [sender];
    if (receiver) users.push(receiver);
    
    for (const user of users) {
      if (user && user.fcmToken) {
        const isSender = user._id.toString() === call.senderId.toString();
        const userType = isSender ? "Sender" : "Receiver";
        
        await sendPushNotification({
          fcmToken: user.fcmToken,
          callId: call._id.toString(),
          senderId: call.senderId,
          receiverId: call.receiverId,
          callerId: call.senderId,
          callerName: "Call Status Update",
          callType: call.callType,
          callStatus: "CALL_IN_PROGRESS",
          title: `📞 Call Update (${userType})`,
          body: `Call ongoing: ${remainingMinutes} mins used. Coins needed: ${remainingCoinsNeeded}. Balance: ${user.totalCoins || user.wallet} coins`,
          notificationType: "call_status_update"
        });
        
        console.log(`📱 Per-minute notification sent to ${userType}: ${user.name || user.mobile}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error sending per-minute notification: ${error.message}`);
    return false;
  }
};


// Real-time coins monitoring function with per-minute notifications
const monitorCallCoins = async (callId, senderId, coinsPerMinute) => {
  try {
    const call = await Calling.findById(callId);
    if (!call || call.status !== "ACTIVE") return;
    
    const sender = await User.findById(senderId);
    if (!sender) return;
    
    const startTime = call.startedAt || new Date();
    const currentTime = new Date();
    const durationSeconds = Math.floor((currentTime - startTime) / 1000);
    const durationMinutes = Math.ceil(durationSeconds / 60);
    
    const totalCoinsNeeded = durationMinutes * coinsPerMinute;
    const alreadyDeducted = call.coinsDeducted || 0;
    const remainingCoins = totalCoinsNeeded - alreadyDeducted;
    
    const senderCoins = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
    
    console.log(`⏰ Real-time monitoring - Call ${callId}:`);
    console.log(`   Duration: ${durationSeconds}s (${durationMinutes}m)`);
    console.log(`   Needed: ${totalCoinsNeeded} coins`);
    console.log(`   Already deducted: ${alreadyDeducted} coins`);
    console.log(`   Remaining: ${remainingCoins} coins`);
    console.log(`   Sender coins: ${senderCoins} coins`);
    
    // ✅ NEW: हर मिनट notification भेजें
    // Check if a full minute has passed
    if (durationSeconds % 60 === 0 || durationSeconds === 30) {
      // Calculate remaining minutes based on coins
      const remainingMinutesBasedOnCoins = Math.floor(senderCoins / coinsPerMinute);
      
      await sendPerMinuteNotification(
        call, 
        sender, 
        durationMinutes, 
        remainingCoins
      );
      
      console.log(`📱 Sent per-minute notification at ${durationSeconds}s`);
    }
    
    // अगर sender के पास insufficient coins हैं
    if (remainingCoins > 0 && senderCoins < remainingCoins) {
      console.log(`❌ Insufficient coins detected! Sender: ${senderCoins} < Needed: ${remainingCoins}`);
      
      // Clear this interval immediately
      if (activeIntervals.has(callId)) {
        clearInterval(activeIntervals.get(callId));
        activeIntervals.delete(callId);
      }
      
      // Send FINAL notification before ending call
      await sendPushNotification({
        fcmToken: sender.fcmToken,
        callId: call._id.toString(),
        senderId: call.senderId,
        receiverId: call.receiverId,
        callerId: call.senderId,
        callerName: "System",
        callType: call.callType,
        callStatus: "CALL_ENDING_SOON",
        title: "⚠️ Call Ending Soon",
        body: `Insufficient coins! Call will end in 30 seconds. You need ${remainingCoins - senderCoins} more coins.`,
        notificationType: "call_ending"
      });
      
      // Wait 30 seconds then end call
      setTimeout(async () => {
        await endCallDueToInsufficientCoins(call, sender, remainingCoins - senderCoins);
        
        // Deduct whatever coins are available
        if (senderCoins > 0) {
          await processPartialDeduction(call, sender, Math.min(senderCoins, remainingCoins));
        }
      }, 30000);
      
      return false; // Call ending soon
    }
    
    return true; // Call continues
  } catch (error) {
    console.error(`❌ Error monitoring call coins: ${error.message}`);
    return true;
  }
};



// Process partial deduction when coins are insufficient
const processPartialDeduction = async (call, sender, coinsToDeduct) => {
  try {
    console.log(`💰 Processing partial deduction: ${coinsToDeduct} coins`);
    
    const senderBefore = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
    
    // Deduct from sender
    if (sender.totalCoins !== undefined) {
      sender.totalCoins -= coinsToDeduct;
      if (sender.totalCoins < 0) sender.totalCoins = 0;
    } else {
      sender.wallet -= coinsToDeduct;
      if (sender.wallet < 0) sender.wallet = 0;
    }
    
    let femaleCredited = 0;
    let adminCredited = 0;
    
    // Credit female receiver and admin if applicable
    if (call.isReceiverFemale) {
      const receiver = await User.findById(call.receiverId);
      if (receiver) {
        // Female gets 60%
        const femaleShare = Math.floor((coinsToDeduct * FEMALE_PERCENTAGE) / 100);
        // Admin gets 40%
        const adminShare = coinsToDeduct - femaleShare;
        
        if (receiver.totalCoins !== undefined) {
          receiver.totalCoins += femaleShare;
        } else {
          receiver.wallet += femaleShare;
        }
        
        // Credit to admin wallet
        await addToAdminWallet(
          adminShare,
          `Commission from call ${call._id} (partial)`,
          sender._id,
          call._id
        );
        
        femaleCredited = femaleShare;
        adminCredited = adminShare;
        
        console.log(`💸 Partial distribution:`);
        console.log(`   Female receiver: ${femaleShare} coins (${FEMALE_PERCENTAGE}%)`);
        console.log(`   Admin wallet: ${adminShare} coins (${ADMIN_PERCENTAGE}%)`);
        
        await addTransactionToHistory(receiver._id, "credited", femaleShare, `Partial from call with ${sender.name || sender.mobile}`);
        await receiver.save();
      }
    } else {
      // Male→Male call: 100% to admin
      await addToAdminWallet(
        coinsToDeduct,
        `Commission from call ${call._id} (Male→Male, partial)`,
        sender._id,
        call._id
      );
      adminCredited = coinsToDeduct;
      console.log(`💸 All ${coinsToDeduct} coins to admin (Male→Male call)`);
    }
    
    await addTransactionToHistory(sender._id, "debited", coinsToDeduct, `Partial call to ${call.receiverId}`);
    await sender.save();
    
    call.coinsDeducted = (call.coinsDeducted || 0) + coinsToDeduct;
    call.femaleCredited = (call.femaleCredited || 0) + femaleCredited;
    call.adminCredited = (call.adminCredited || 0) + adminCredited;
    
    await call.save();
    
    console.log(`✅ Partial deduction completed: ${coinsToDeduct} coins`);
    return true;
  } catch (error) {
    console.error(`❌ Error processing partial deduction: ${error.message}`);
    return false;
  }
};

// ==================== 1. SEND CALLING REQUEST ====================
export const sendCallingRequest = async (req, res) => {
  console.log("══════════════════════════════════════════════════");
  console.log("📞 [API CALL] INITIATING CALL");
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
  console.log("──────────────────────────────────────────────────");
  
  try {
    const { senderId, receiverId, callerId, callType } = req.body;
    
    console.log("🔑 Received Zego Room ID (callerId) from frontend:", callerId);
    console.log("⚠️ Note: callerId is actually Zego Room ID, not user ID");

    // 1. Find users
    console.log(`🔍 Finding users: Sender=${senderId}, Receiver=${receiverId}`);
    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);

    if (!sender || !receiver) {
      console.log("❌ User not found");
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }
    console.log(`✅ Users found: ${sender.name}, ${receiver.name}`);
    console.log(`⚥ Gender: Sender=${sender.gender}, Receiver=${receiver.gender}`);

    // 2. ✅ NEW LOGIC: Gender-based coin checking
    console.log(`💰 Checking coins based on gender logic:`);
    
    const isReceiverFemale = receiver.gender === 'female';
    console.log(`🔍 Receiver is female: ${isReceiverFemale}`);
    
    let hasSufficientCoins = false;
    
    if (isReceiverFemale) {
      // ✅ FEMALE LOGIC: Female receiver के पास coins नहीं भी हों तो भी call जा सकती है
      console.log(`🎀 Female receiver detected - checking sender's coins only`);
      const senderCoins = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
      
      if (senderCoins >= MIN_COINS) {
        hasSufficientCoins = true;
        console.log(`✅ Female receiver - Only sender needs coins: ${senderCoins} >= ${MIN_COINS}`);
      } else {
        console.log(`❌ Female receiver - Sender doesn't have enough coins: ${senderCoins} < ${MIN_COINS}`);
      }
    } else {
      // ✅ NORMAL LOGIC: Male receiver के लिए दोनों के पास coins होने चाहिए
      console.log(`👨 Male receiver detected - checking both users' coins`);
      const senderCoins = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
      const receiverCoins = receiver.totalCoins !== undefined ? receiver.totalCoins : receiver.wallet;
      
      if (senderCoins >= MIN_COINS && receiverCoins >= MIN_COINS) {
        hasSufficientCoins = true;
        console.log(`✅ Both users have sufficient coins`);
      } else {
        console.log(`❌ Not enough coins: Sender=${senderCoins}, Receiver=${receiverCoins}, Required=${MIN_COINS}`);
      }
    }
    
    if (!hasSufficientCoins) {
      return res.status(400).json({ 
        success: false, 
        message: "Not enough coins" 
      });
    }
    
    console.log("✅ Coin check passed (gender-based logic)");

    // 3. Use callerId as Zego Room ID
    const zegoRoomId = callerId;
    console.log(`✅ Using Zego Room ID from frontend: ${zegoRoomId}`);
    
    const senderToken = zegoService.generateToken(`user_${senderId}`, zegoRoomId);
    const receiverToken = zegoService.generateToken(`user_${receiverId}`, zegoRoomId);

    if (!senderToken || !receiverToken) {
      console.log("❌ Failed to generate Zego tokens");
      return res.status(500).json({ 
        success: false, 
        message: "Failed to generate tokens" 
      });
    }
    console.log("✅ Zego tokens generated successfully");

    // 4. Create call record
    console.log("📝 Creating call record in database");
    const call = await Calling.create({
      senderId,
      receiverId,
      callerId: senderId,
      callType,
      callerName: sender.name || sender.mobile || "Someone",
      zegoRoomId,
      senderZegoId: `user_${senderId}`,
      receiverZegoId: `user_${receiverId}`,
      status: "RINGING",
      type: "incoming_call",
      coinsDeducted: 0,
      femaleCredited: 0,
      adminCredited: 0,
      senderGender: sender.gender,
      receiverGender: receiver.gender,
      isReceiverFemale: receiver.gender === 'female', // ✅ Store gender info
      createdAt: new Date(),
    });
    console.log(`✅ Call record created: ${call._id}`);
    console.log(`✅ Saved in DB: zegoRoomId = ${zegoRoomId}`);

    // 5. Send push notification
    if (receiver.fcmToken) {
      console.log(`📱 Sending push notification to receiver`);
      
      await sendPushNotification({
        fcmToken: receiver.fcmToken,
        callId: call._id.toString(),
        senderId: senderId,
        receiverId: receiverId,
        callerId: senderId,
        callerName: sender.name || sender.mobile || "Someone",
        callType: callType,
        zegoData: {
          roomId: zegoRoomId,
          token: receiverToken,
          appId: process.env.ZEGO_APP_ID || "1837791744",
          userId: `user_${receiverId}`,
        },
        callStatus: "RINGING",
      });
      console.log("✅ Push notification sent");
    } else {
      console.log("⚠️ No FCM token for receiver");
    }

    // 6. Set auto-reject timeout (60 seconds) - UPDATED FOR MISSED CALL
    console.log(`⏰ Setting auto-reject timeout for 60 seconds (MISSED CALL)`);
    const timeoutId = setTimeout(async () => {
      console.log("⏰ Auto-reject timeout triggered - MARKING AS MISSED CALL");
      const currentCall = await Calling.findById(call._id);
      if (currentCall && currentCall.status === "RINGING") {
        console.log(`❌ Call ${call._id} not answered for 60 seconds - MARKING AS MISSED`);
        
        // ✅ CHANGE: Update status to MISSED instead of REJECTED
        currentCall.status = "MISSED";
        currentCall.type = "call_missed"; // ✅ Changed type
        currentCall.endedAt = new Date();
        await currentCall.save();
        
        activeCallTimeouts.delete(call._id.toString());
        console.log(`✅ Call ${call._id} marked as MISSED CALL`);
        
        // ✅ CHANGE: Send MISSED call notification to sender
        const senderUser = await User.findById(currentCall.senderId);
        if (senderUser && senderUser.fcmToken) {
          console.log(`📱 Notifying sender about MISSED call`);
          await sendPushNotification({
            fcmToken: senderUser.fcmToken,
            callId: currentCall._id.toString(),
            senderId: currentCall.senderId,
            receiverId: currentCall.receiverId,
            callerId: currentCall.senderId,
            callerName: currentCall.callerName,
            callType: currentCall.callType,
            callStatus: "MISSED", // ✅ Changed to MISSED
            message: "Call missed - No answer"
          });
        }
        
        // ✅ OPTIONAL: Also notify receiver about missed call (if you want)
        const receiverUser = await User.findById(currentCall.receiverId);
        if (receiverUser && receiverUser.fcmToken) {
          console.log(`📱 Notifying receiver about missed call`);
          await sendPushNotification({
            fcmToken: receiverUser.fcmToken,
            callId: currentCall._id.toString(),
            senderId: currentCall.senderId,
            receiverId: currentCall.receiverId,
            callerId: currentCall.senderId,
            callerName: currentCall.callerName,
            callType: currentCall.callType,
            callStatus: "MISSED_CALL_NOTIFICATION", // Different type for receiver
            message: `Missed call from ${currentCall.callerName}`
          });
        }
      }
    }, 60000);

    // Store timeout
    activeCallTimeouts.set(call._id.toString(), timeoutId);
    console.log(`✅ Timeout stored for call ${call._id}`);

    // 7. Return response
    console.log("📤 Sending response to client");
    console.log("══════════════════════════════════════════════════");
    
    return res.status(201).json({
      success: true,
      message: "Call initiated",
      call: {
        id: call._id,
        status: call.status,
        callerName: sender.name || sender.mobile || "Someone",
        roomId: zegoRoomId,
        createdAt: call.createdAt,
      },
      zegoCredentials: {
        sender: {
          appId: process.env.ZEGO_APP_ID || "1837791744",
          roomId: zegoRoomId,
          token: senderToken,
          userId: `user_${senderId}`,
          server: "wss://webliveroom1837791744-api.coolzcloud.com/ws",
        },
        receiver: {
          appId: process.env.ZEGO_APP_ID || "1837791744",
          roomId: zegoRoomId,
          token: receiverToken,
          userId: `user_${receiverId}`,
          server: "wss://webliveroom1837791744-api.coolzcloud.com/ws",
        },
      },
    });
    
  } catch (error) {
    console.error("══════════════════════════════════════════════════");
    console.error("❌ [ERROR] sendCallingRequest error:", error);
    console.error("══════════════════════════════════════════════════");
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ==================== 2. ROOM CREATE ====================
export const handleRoomCreate = async (req, res) => {
  console.log("══════════════════════════════════════════════════");
  console.log("🔄 [WEBHOOK] ZEGO CALLBACK: Room Create");
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
  console.log("──────────────────────────────────────────────────");
  
  try {
    const { room_id, room_create_time } = req.body;
    console.log(`🔍 Looking for call with room ID: ${room_id}`);
    
    // Find call by room ID
    const call = await Calling.findOne({ zegoRoomId: room_id });
    if (call) {
      console.log(`✅ Found call: ${call._id}`);
      
      // FIX: Check if room_create_time is valid
      if (room_create_time) {
        try {
          // Zego timestamp is in milliseconds (already)
          const createTime = parseInt(room_create_time);
          if (!isNaN(createTime)) {
            call.roomCreatedAt = new Date(createTime);
            await call.save();
            console.log(`✅ Room ${room_id} created at ${call.roomCreatedAt}`);
          } else {
            console.log(`⚠️ Invalid room_create_time: ${room_create_time}`);
            call.roomCreatedAt = new Date();
            await call.save();
          }
        } catch (timeError) {
          console.log(`⚠️ Error parsing time, using current time`);
          call.roomCreatedAt = new Date();
          await call.save();
        }
      } else {
        console.log(`⚠️ No room_create_time provided`);
        call.roomCreatedAt = new Date();
        await call.save();
      }
    } else {
      console.log(`⚠️ No call found for room ${room_id}`);
    }
    
    console.log("📤 Sending success response to Zego");
    console.log("══════════════════════════════════════════════════");
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error("══════════════════════════════════════════════════");
    console.error("❌ [ERROR] handleRoomCreate error:", error);
    console.error("══════════════════════════════════════════════════");
    return res.status(500).json({ success: false });
  }
};

// ==================== 3. ROOM LOGGED IN (USER JOINED) ====================
export const handleUserJoined = async (req, res) => {
  console.log("══════════════════════════════════════════════════");
  console.log("🔄 [WEBHOOK] ZEGO CALLBACK: User Joined");
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
  console.log("──────────────────────────────────────────────────");
  
  try {
    const { room_id, user_account, login_time } = req.body;
    console.log(`🔍 Looking for call with room ID: ${room_id}`);
    console.log(`👤 User Account: ${user_account}, Login Time: ${login_time}`);
    
    // Find call by room ID
    const call = await Calling.findOne({ zegoRoomId: room_id });
    if (!call) {
      console.log(`⚠️ No call found for room: ${room_id}`);
      console.log("📤 Sending response to Zego");
      console.log("══════════════════════════════════════════════════");
      return res.status(200).json({ success: true });
    }
    
    console.log(`✅ Found call: ${call._id}, Status: ${call.status}`);
    
    // FIX: Zego sends user_account, not user_id
    const actualUserId = user_account;
    const isReceiver = call.receiverId.toString() === actualUserId;
    console.log(`👥 User Comparison: Actual=${actualUserId}, Receiver=${call.receiverId}, IsReceiver=${isReceiver}`);
    
    // If receiver joined and call is ringing
    if (isReceiver && call.status === "RINGING") {
      console.log("🎯 Receiver joined ringing call!");
      
      // Update call to ACTIVE
      call.status = "ACTIVE";
      call.type = "call_accepted";
      
      // FIX: Parse login_time safely
      if (login_time) {
        try {
          const loginTime = parseInt(login_time);
          if (!isNaN(loginTime)) {
            call.startedAt = new Date(loginTime);
            console.log(`📅 Call started at: ${call.startedAt}`);
          } else {
            call.startedAt = new Date();
            console.log(`📅 Call started at (now): ${call.startedAt}`);
          }
        } catch (timeError) {
          call.startedAt = new Date();
          console.log(`📅 Call started at (fallback): ${call.startedAt}`);
        }
      } else {
        call.startedAt = new Date();
        console.log(`📅 Call started at (default): ${call.startedAt}`);
      }
      
      // Clear timeout if exists
      if (activeCallTimeouts.has(call._id.toString())) {
        clearTimeout(activeCallTimeouts.get(call._id.toString()));
        activeCallTimeouts.delete(call._id.toString());
        console.log("✅ Cleared auto-reject timeout");
      }
      
      await call.save();
      console.log(`✅ Call ${call._id} status updated to ACTIVE`);
      
      // ✅ UPDATED LOGIC: Coins deduction logic with admin wallet
      console.log("💰 NEW DEDUCTION LOGIC: 1 मिनट = 10 coins (COINS_PER_MINUTE)");
      console.log(`⚥ Gender Info: Sender=${call.senderGender}, Receiver=${call.receiverGender}, IsReceiverFemale=${call.isReceiverFemale}`);
      
      const sender = await User.findById(call.senderId);
      const receiver = await User.findById(call.receiverId);
      
      if (sender && receiver) {
        const initialCoinsToDeduct = COINS_PER_MINUTE; // 1 मिनट के 10 coins
        
        console.log(`💰 Initial deduction: ${initialCoinsToDeduct} coins (for first minute)`);
        
        // ✅ REAL-TIME MONITORING SETUP WITH PER-MINUTE NOTIFICATIONS
        // Set interval to check coins every 30 seconds (for real-time monitoring)
        const monitorInterval = setInterval(async () => {
          try {
            const currentCall = await Calling.findById(call._id);
            if (!currentCall || currentCall.status !== "ACTIVE") {
              clearInterval(monitorInterval);
              activeIntervals.delete(call._id.toString());
              console.log(`✅ Stopped monitoring - Call ${call._id} is no longer active`);
              return;
            }
            
            const currentSender = await User.findById(currentCall.senderId);
            if (!currentSender) {
              clearInterval(monitorInterval);
              activeIntervals.delete(call._id.toString());
              return;
            }
            
            // Call the monitoring function
            await monitorCallCoins(
              currentCall._id, 
              currentSender._id, 
              COINS_PER_MINUTE
            );
            
          } catch (monitorError) {
            console.error(`❌ Error in monitoring interval: ${monitorError.message}`);
          }
        }, 30000); // Check every 30 seconds
        
        // ✅ NEW: PER-MINUTE NOTIFICATION INTERVAL
        // यह interval हर मिनट notification भेजेगा
        const perMinuteNotificationInterval = setInterval(async () => {
          try {
            const currentCall = await Calling.findById(call._id);
            if (!currentCall || currentCall.status !== "ACTIVE") {
              clearInterval(perMinuteNotificationInterval);
              if (activePerMinuteIntervals.has(call._id.toString())) {
                activePerMinuteIntervals.delete(call._id.toString());
              }
              console.log(`✅ Stopped per-minute notifications - Call ended`);
              return;
            }
            
            const currentSender = await User.findById(currentCall.senderId);
            if (!currentSender) {
              clearInterval(perMinuteNotificationInterval);
              if (activePerMinuteIntervals.has(call._id.toString())) {
                activePerMinuteIntervals.delete(call._id.toString());
              }
              return;
            }
            
            const startTime = currentCall.startedAt || new Date();
            const currentTime = new Date();
            const durationSeconds = Math.floor((currentTime - startTime) / 1000);
            const durationMinutes = Math.floor(durationSeconds / 60);
            
            // हर मिनट के शुरू में notification भेजें (0, 60, 120, 180... seconds)
            // But skip 0th minute (just started)
            if (durationSeconds % 60 === 0 && durationSeconds > 0) {
              const totalCoinsNeeded = durationMinutes * COINS_PER_MINUTE;
              const alreadyDeducted = currentCall.coinsDeducted || 0;
              const remainingCoins = totalCoinsNeeded - alreadyDeducted;
              
              const senderCoins = currentSender.totalCoins !== undefined ? 
                currentSender.totalCoins : currentSender.wallet;
              
              // Calculate how many more minutes user can talk
              const remainingMinutes = Math.floor(senderCoins / COINS_PER_MINUTE);
              
              // Send notification to BOTH users
              await sendPerMinuteNotification(
                currentCall, 
                currentSender, 
                durationMinutes, 
                remainingCoins
              );
              
              console.log(`⏰ Per-minute notification sent at ${durationMinutes} minutes (${durationSeconds}s)`);
              
              // ✅ अगर सिर्फ 2 मिनट coins बचे हैं तो warning भेजें
              if (remainingMinutes <= 2 && remainingMinutes > 0) {
                const receiverUser = await User.findById(currentCall.receiverId);
                
                // Send warning to sender
                if (currentSender.fcmToken) {
                  await sendPushNotification({
                    fcmToken: currentSender.fcmToken,
                    callId: currentCall._id.toString(),
                    senderId: currentCall.senderId,
                    receiverId: currentCall.receiverId,
                    callerId: currentCall.senderId,
                    callerName: "System",
                    callType: currentCall.callType,
                    callStatus: "LOW_BALANCE_WARNING",
                    title: "⚠️ Low Balance Warning",
                    body: `Only ${remainingMinutes} minute(s) of coins left! Please recharge soon.`,
                    notificationType: "warning"
                  });
                  console.log(`⚠️ Low balance warning sent to sender: ${remainingMinutes} min(s) left`);
                }
                
                // Also notify receiver (optional)
                if (receiverUser && receiverUser.fcmToken) {
                  await sendPushNotification({
                    fcmToken: receiverUser.fcmToken,
                    callId: currentCall._id.toString(),
                    senderId: currentCall.senderId,
                    receiverId: currentCall.receiverId,
                    callerId: currentCall.senderId,
                    callerName: "System",
                    callType: currentCall.callType,
                    callStatus: "PARTNER_LOW_BALANCE",
                    title: "ℹ️ Call Status",
                    body: `Partner has low balance. Call may end soon.`,
                    notificationType: "info"
                  });
                  console.log(`ℹ️ Partner low balance notification sent to receiver`);
                }
              }
              
              // ✅ अगर कोई coins नहीं बचे हैं तो immediate warning
              if (remainingMinutes === 0 && senderCoins > 0) {
                if (currentSender.fcmToken) {
                  await sendPushNotification({
                    fcmToken: currentSender.fcmToken,
                    callId: currentCall._id.toString(),
                    senderId: currentCall.senderId,
                    receiverId: currentCall.receiverId,
                    callerId: currentCall.senderId,
                    callerName: "System",
                    callType: currentCall.callType,
                    callStatus: "CRITICAL_BALANCE",
                    title: "🚨 Critical Balance",
                    body: `You have only ${senderCoins} coins left! Call will end in 30 seconds if not recharged.`,
                    notificationType: "critical"
                  });
                  console.log(`🚨 Critical balance warning sent to sender`);
                }
              }
            }
            
          } catch (error) {
            console.error(`❌ Error in per-minute notification interval: ${error.message}`);
          }
        }, 1000); // Check every second for exact minute timing
        
        // Store both intervals
        activeIntervals.set(call._id.toString(), monitorInterval);
        activePerMinuteIntervals.set(call._id.toString(), perMinuteNotificationInterval);
        console.log(`⏰ Real-time coins monitoring started for call ${call._id}`);
        console.log(`🔔 Per-minute notifications enabled for call ${call._id}`);
        
        // ✅ Check if sender has enough coins for first minute
        const senderCoins = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
        if (senderCoins < initialCoinsToDeduct) {
          console.log(`❌ Sender doesn't have enough coins: ${senderCoins} < ${initialCoinsToDeduct}`);
          
          // Clear all intervals
          clearAllCallIntervals(call._id);
          
          console.log(`📱 Sending recharge notification to sender`);
          
          // Send immediate notification
          if (sender.fcmToken) {
            await sendPushNotification({
              fcmToken: sender.fcmToken,
              callId: call._id.toString(),
              senderId: call.senderId,
              receiverId: call.receiverId,
              callerId: call.senderId,
              callerName: "System",
              callType: call.callType,
              callStatus: "CALL_ENDED_NO_COINS",
              title: "❌ Call Failed",
              body: `Call failed - You need ${initialCoinsToDeduct - senderCoins} more coins to start the call.`,
              notificationType: "call_failed"
            });
            console.log(`📱 Call failed notification sent to sender`);
          }
          
          // End the call if not enough coins
          call.status = "ENDED";
          call.type = "call_ended_no_coins";
          call.endedAt = new Date();
          call.duration = 0;
          await call.save();
          console.log(`✅ Call ended due to insufficient coins`);
          
          console.log("📤 Sending response to Zego");
          console.log("══════════════════════════════════════════════════");
          return res.status(200).json({ success: true });
        }
        
        // ✅ DEDUCTION LOGIC: सिर्फ male user से coins deduct होंगे
        console.log(`💰 DEDUCTING FROM MALE USER ONLY: ${initialCoinsToDeduct} coins`);
        
        let deductedFromSender = 0;
        let creditedToFemale = 0;
        let creditedToAdmin = 0;
        
        // Case 1: Female receiver (male sender से deduct, female को 60%, admin को 40%)
        if (call.isReceiverFemale) {
          console.log(`👨‍❤️‍👨 Case: Male → Female call`);
          
          // Deduct from male sender
          const senderBefore = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
          if (sender.totalCoins !== undefined) {
            sender.totalCoins -= initialCoinsToDeduct;
            if (sender.totalCoins < 0) sender.totalCoins = 0;
          } else {
            sender.wallet -= initialCoinsToDeduct;
            if (sender.wallet < 0) sender.wallet = 0;
          }
          deductedFromSender = initialCoinsToDeduct;
          
          // Calculate distribution: Female gets 60%, Admin gets 40%
          const femaleShare = Math.floor((initialCoinsToDeduct * FEMALE_PERCENTAGE) / 100); // 60%
          const adminShare = initialCoinsToDeduct - femaleShare; // 40%
          
          // Credit to female receiver (60%)
          const receiverBefore = receiver.totalCoins !== undefined ? receiver.totalCoins : receiver.wallet;
          if (receiver.totalCoins !== undefined) {
            receiver.totalCoins += femaleShare;
          } else {
            receiver.wallet += femaleShare;
          }
          creditedToFemale = femaleShare;
          
          // ✅ NEW: Credit to admin wallet (40%)
          await addToAdminWallet(
            adminShare,
            `Commission from call ${call._id} (Male→Female)`,
            sender._id,
            call._id
          );
          creditedToAdmin = adminShare;
          
          console.log(`💸 Distribution of ${initialCoinsToDeduct} coins:`);
          console.log(`   Female receiver: ${femaleShare} coins (${FEMALE_PERCENTAGE}%)`);
          console.log(`   Admin wallet: ${adminShare} coins (${ADMIN_PERCENTAGE}%)`);
          
          // Add to transaction history
          await addTransactionToHistory(sender._id, "debited", initialCoinsToDeduct, `Call to ${receiver.name || receiver.mobile}`);
          await addTransactionToHistory(receiver._id, "credited", femaleShare, `Received from call with ${sender.name || sender.mobile}`);
          
        } 
        // Case 2: Male receiver (दोनों से deduct, admin को 200%)
        else {
          console.log(`👨‍❤️‍👨 Case: Male → Male call`);
          
          // ✅ FIX: Deduct from BOTH users
          // Deduct from sender
          const senderBefore = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
          if (sender.totalCoins !== undefined) {
            sender.totalCoins -= initialCoinsToDeduct;
            if (sender.totalCoins < 0) sender.totalCoins = 0;
          } else {
            sender.wallet -= initialCoinsToDeduct;
            if (sender.wallet < 0) sender.wallet = 0;
          }
          
          // Deduct from receiver
          const receiverBefore = receiver.totalCoins !== undefined ? receiver.totalCoins : receiver.wallet;
          if (receiver.totalCoins !== undefined) {
            receiver.totalCoins -= initialCoinsToDeduct;
            if (receiver.totalCoins < 0) receiver.totalCoins = 0;
          } else {
            receiver.wallet -= initialCoinsToDeduct;
            if (receiver.wallet < 0) receiver.wallet = 0;
          }
          
          deductedFromSender = initialCoinsToDeduct;
          
          // ✅ FIX: 200% to admin wallet for Male→Male calls (100% from each)
          await addToAdminWallet(
            initialCoinsToDeduct * 2, // दोनों के coins
            `Commission from call ${call._id} (Male→Male)`,
            sender._id,
            call._id
          );
          creditedToAdmin = initialCoinsToDeduct * 2;
          
          console.log(`💸 Distribution of ${initialCoinsToDeduct * 2} coins:`);
          console.log(`   Sender deducted: ${initialCoinsToDeduct} coins`);
          console.log(`   Receiver deducted: ${initialCoinsToDeduct} coins`);
          console.log(`   Admin wallet: ${initialCoinsToDeduct * 2} coins (200%)`);
          console.log(`   Note: Male→Male call, both users pay`);
          
          // Add to transaction history for both
          await addTransactionToHistory(sender._id, "debited", initialCoinsToDeduct, `Call to ${receiver.name || receiver.mobile}`);
          await addTransactionToHistory(receiver._id, "debited", initialCoinsToDeduct, `Call from ${sender.name || sender.mobile}`);
        }
        
        await sender.save();
        await receiver.save();
        
        call.coinsDeducted = initialCoinsToDeduct;
        call.femaleCredited = creditedToFemale;
        call.adminCredited = creditedToAdmin;
        await call.save();
        
        console.log(`💰 Coin Transaction Complete:`);
        console.log(`   Sender deducted: ${deductedFromSender} coins`);
        if (creditedToFemale > 0) {
          console.log(`   Receiver credited: ${creditedToFemale} coins (${FEMALE_PERCENTAGE}%)`);
        }
        console.log(`   Admin credited: ${creditedToAdmin} coins`);
        console.log(`   Total coins for this call: ${call.coinsDeducted}`);
        
        // Show admin balance
        const adminBalance = await getAdminBalance();
        console.log(`💰 Current Admin wallet balance: ${adminBalance} coins`);
        
        // ✅ Send FIRST MINUTE notification immediately
        await sendPerMinuteNotification(call, sender, 1, COINS_PER_MINUTE);
        console.log(`📱 First minute notification sent`);
        
        // ✅ Set up billing timer for every minute
        const billingTimer = setInterval(async () => {
          try {
            const currentCall = await Calling.findById(call._id);
            if (!currentCall || currentCall.status !== "ACTIVE") {
              clearInterval(billingTimer);
              billingTimers.delete(call._id.toString());
              return;
            }
            
            console.log(`⏰ Billing timer triggered for call ${call._id}`);
            
          } catch (billingError) {
            console.error(`❌ Error in billing timer: ${billingError.message}`);
          }
        }, 60000); // Every minute
        
        billingTimers.set(call._id.toString(), billingTimer);
        console.log(`⏰ Billing timer started for call ${call._id}`);
        
      }
    } else if (call.status === "ACTIVE") {
      console.log(`ℹ️ User ${user_account} joined active call ${call._id}`);
    } else {
      console.log(`ℹ️ User ${user_account} joined but call status is ${call.status}`);
    }
    
    console.log("📤 Sending success response to Zego");
    console.log("══════════════════════════════════════════════════");
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error("══════════════════════════════════════════════════");
    console.error("❌ [ERROR] handleUserJoined error:", error);
    console.error("══════════════════════════════════════════════════");
    return res.status(500).json({ success: false });
  }
};
// ==================== 4. ROOM LOGGED OUT (USER LEFT) ====================
export const handleUserLeft = async (req, res) => {
  console.log("══════════════════════════════════════════════════");
  console.log("🔄 [WEBHOOK] ZEGO CALLBACK: User Left");
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
  console.log("──────────────────────────────────────────────────");
  
  try {
    const { room_id, user_account, logout_time } = req.body;
    console.log(`🔍 Looking for call with room ID: ${room_id}`);
    console.log(`👤 User Account: ${user_account}, Logout Time: ${logout_time}`);
    
    // Find call by room ID
    const call = await Calling.findOne({ zegoRoomId: room_id });
    if (!call) {
      console.log(`⚠️ No call found for room: ${room_id}`);
      console.log("📤 Sending response to Zego");
      console.log("══════════════════════════════════════════════════");
      return res.status(200).json({ success: true });
    }
    
    console.log(`✅ Found call: ${call._id}, Status: ${call.status}`);
    
    // ✅ Clear monitoring interval if exists
    if (activeIntervals.has(call._id.toString())) {
      clearInterval(activeIntervals.get(call._id.toString()));
      activeIntervals.delete(call._id.toString());
      console.log(`✅ Cleared coins monitoring interval for call ${call._id}`);
    }
    
    // ✅ Clear billing timer if exists
    if (billingTimers.has(call._id.toString())) {
      clearInterval(billingTimers.get(call._id.toString()));
      billingTimers.delete(call._id.toString());
      console.log(`✅ Cleared billing timer for call ${call._id}`);
    }
    
    // ✅ Clear call timeout if exists
    if (activeCallTimeouts.has(call._id.toString())) {
      clearTimeout(activeCallTimeouts.get(call._id.toString()));
      activeCallTimeouts.delete(call._id.toString());
      console.log(`✅ Cleared call timeout for call ${call._id}`);
    }
    
    // Only process if call is active
    if (call.status === "ACTIVE") {
      console.log("🎯 Processing active call...");
      
      const actualUserId = user_account;
      const isSender = call.senderId.toString() === actualUserId;
      const isReceiver = call.receiverId.toString() === actualUserId;
      console.log(`👥 User Role: Sender=${isSender}, Receiver=${isReceiver}`);
      
      if (isSender || isReceiver) {
        // FIX: Parse logout_time safely
        let endTime = new Date();
        if (logout_time) {
          try {
            const logoutTime = parseInt(logout_time);
            if (!isNaN(logoutTime)) {
              endTime = new Date(logoutTime);
            }
          } catch (timeError) {
            endTime = new Date();
          }
        }
        
        const startTime = call.startedAt || new Date();
        const durationSeconds = Math.floor((endTime - startTime) / 1000);
        const durationMinutes = Math.ceil(durationSeconds / 60);
        
        console.log(`⏱️ Call Duration:`);
        console.log(`   Start: ${startTime}`);
        console.log(`   End: ${endTime}`);
        console.log(`   Duration: ${durationSeconds} seconds`);
        console.log(`   Rounded Minutes: ${durationMinutes} minutes`);
        console.log(`💰 Rate: ${COINS_PER_MINUTE} coins per minute`);
        
        // Calculate total coins needed
        const totalCoinsNeeded = durationMinutes * COINS_PER_MINUTE;
        const remainingCoins = totalCoinsNeeded - call.coinsDeducted;
        
        console.log(`💰 Coin Calculation:`);
        console.log(`   Already deducted: ${call.coinsDeducted} coins`);
        console.log(`   Total needed: ${totalCoinsNeeded} coins (${durationMinutes} mins × ${COINS_PER_MINUTE})`);
        console.log(`   Remaining: ${remainingCoins} coins`);
        
        if (remainingCoins > 0) {
          console.log("💰 Deducting remaining coins...");
          const sender = await User.findById(call.senderId);
          
          if (sender) {
            const senderCoins = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
            
            // ✅ NEW LOGIC: Check if sender has enough coins
            if (senderCoins < remainingCoins) {
              console.log(`⚠️ Sender has insufficient coins: ${senderCoins} < ${remainingCoins}`);
              console.log(`📱 Sending recharge notification to sender`);
              await sendRechargeNotification(sender._id, remainingCoins - senderCoins);
              
              // ✅ ADDED: Call ended notification भी भेजें
              if (sender.fcmToken) {
                await sendPushNotification({
                  fcmToken: sender.fcmToken,
                  callId: call._id.toString(),
                  senderId: call.senderId,
                  receiverId: call.receiverId,
                  callerId: call.senderId,
                  callerName: call.callerName,
                  callType: call.callType,
                  callStatus: "CALL_ENDED_INSUFFICIENT_COINS",
                  message: `Call ended - Insufficient coins during call`
                });
                console.log(`📱 Call ended notification sent to sender`);
              }
              
              // Deduct whatever coins are available
              const coinsToDeduct = Math.min(senderCoins, remainingCoins);
              
              if (coinsToDeduct > 0) {
                // Deduct from sender
                const senderBefore = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
                if (sender.totalCoins !== undefined) {
                  sender.totalCoins -= coinsToDeduct;
                  if (sender.totalCoins < 0) sender.totalCoins = 0;
                } else {
                  sender.wallet -= coinsToDeduct;
                  if (sender.wallet < 0) sender.wallet = 0;
                }
                
                let femaleCredited = 0;
                let adminCredited = 0;
                
                // Credit female receiver and admin if applicable
                if (call.isReceiverFemale) {
                  const receiver = await User.findById(call.receiverId);
                  if (receiver) {
                    // Female gets 60%
                    const femaleShare = Math.floor((coinsToDeduct * FEMALE_PERCENTAGE) / 100);
                    // Admin gets 40%
                    const adminShare = coinsToDeduct - femaleShare;
                    
                    if (receiver.totalCoins !== undefined) {
                      receiver.totalCoins += femaleShare;
                    } else {
                      receiver.wallet += femaleShare;
                    }
                    
                    // Credit to admin wallet
                    await addToAdminWallet(
                      adminShare,
                      `Commission from call ${call._id} (partial due to insufficient balance)`,
                      sender._id,
                      call._id
                    );
                    
                    femaleCredited = femaleShare;
                    adminCredited = adminShare;
                    
                    console.log(`💸 Partial distribution:`);
                    console.log(`   Female receiver: ${femaleShare} coins (${FEMALE_PERCENTAGE}%)`);
                    console.log(`   Admin wallet: ${adminShare} coins (${ADMIN_PERCENTAGE}%)`);
                    
                    await addTransactionToHistory(receiver._id, "credited", femaleShare, `Partial from call with ${sender.name || sender.mobile}`);
                    await receiver.save();
                  }
                } else {
                  // Male→Male call: 100% to admin
                  await addToAdminWallet(
                    coinsToDeduct,
                    `Commission from call ${call._id} (Male→Male, partial)`,
                    sender._id,
                    call._id
                  );
                  adminCredited = coinsToDeduct;
                  console.log(`💸 All ${coinsToDeduct} coins to admin (Male→Male call)`);
                }
                
                await addTransactionToHistory(sender._id, "debited", coinsToDeduct, `Partial call to ${call.receiverId}`);
                await sender.save();
                
                call.coinsDeducted += coinsToDeduct;
                call.femaleCredited = (call.femaleCredited || 0) + femaleCredited;
                call.adminCredited = (call.adminCredited || 0) + adminCredited;
                console.log(`💰 Partial deduction: ${coinsToDeduct} coins (due to insufficient balance)`);
              }
            } else {
              // Normal case: Sender has enough coins
              console.log(`✅ Sender has sufficient coins: ${senderCoins} >= ${remainingCoins}`);
              
              // Deduct from sender
              const senderBefore = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
              if (sender.totalCoins !== undefined) {
                sender.totalCoins -= remainingCoins;
                if (sender.totalCoins < 0) sender.totalCoins = 0;
              } else {
                sender.wallet -= remainingCoins;
                if (sender.wallet < 0) sender.wallet = 0;
              }
              
              let femaleCredited = 0;
              let adminCredited = 0;
              
              // Credit female receiver and admin if applicable
              if (call.isReceiverFemale) {
                const receiver = await User.findById(call.receiverId);
                if (receiver) {
                  // Female gets 60%
                  const femaleShare = Math.floor((remainingCoins * FEMALE_PERCENTAGE) / 100);
                  // Admin gets 40%
                  const adminShare = remainingCoins - femaleShare;
                  
                  if (receiver.totalCoins !== undefined) {
                    receiver.totalCoins += femaleShare;
                  } else {
                    receiver.wallet += femaleShare;
                  }
                  
                  // Credit to admin wallet
                  await addToAdminWallet(
                    adminShare,
                    `Commission from call ${call._id} (Male→Female)`,
                    sender._id,
                    call._id
                  );
                  
                  femaleCredited = femaleShare;
                  adminCredited = adminShare;
                  
                  console.log(`💸 Distribution:`);
                  console.log(`   Female receiver: ${femaleShare} coins (${FEMALE_PERCENTAGE}%)`);
                  console.log(`   Admin wallet: ${adminShare} coins (${ADMIN_PERCENTAGE}%)`);
                  
                  await addTransactionToHistory(receiver._id, "credited", femaleShare, `Call with ${sender.name || sender.mobile}`);
                  await receiver.save();
                }
              } else {
                // Male→Male call: 100% to admin
                await addToAdminWallet(
                  remainingCoins,
                  `Commission from call ${call._id} (Male→Male)`,
                  sender._id,
                  call._id
                );
                adminCredited = remainingCoins;
                console.log(`💸 All ${remainingCoins} coins to admin (Male→Male call)`);
              }
              
              await addTransactionToHistory(sender._id, "debited", remainingCoins, `Call to ${call.receiverId}`);
              await sender.save();
              
              call.coinsDeducted = totalCoinsNeeded;
              call.femaleCredited = (call.femaleCredited || 0) + femaleCredited;
              call.adminCredited = (call.adminCredited || 0) + adminCredited;
              console.log(`💰 Full deduction: ${remainingCoins} coins from sender`);
            }
          }
        } else {
          console.log("✅ No additional coins to deduct");
        }
        
        // Update call status
        call.status = "ENDED";
        call.type = isSender ? "call_ended_by_sender" : "call_ended_by_receiver";
        call.endedAt = endTime;
        call.duration = durationSeconds;
        await call.save();
        
        console.log(`✅ Call ${call._id} ended by ${isSender ? 'sender' : 'receiver'}`);
        console.log(`📊 Final Call Status: ${call.status}, Type: ${call.type}, Duration: ${call.duration}s`);
        console.log(`💰 Final coins deducted: ${call.coinsDeducted} coins`);
        console.log(`👩 Female credited: ${call.femaleCredited || 0} coins`);
        console.log(`👨‍💼 Admin credited: ${call.adminCredited || 0} coins`);
        
        // Show admin balance
        const adminBalance = await getAdminBalance();
        console.log(`💰 Current Admin wallet balance: ${adminBalance} coins`);
      } else {
        console.log("⚠️ User is not part of this call");
      }
    } else {
      console.log(`ℹ️ Call status is ${call.status}, skipping processing`);
    }
    
    console.log("📤 Sending success response to Zego");
    console.log("══════════════════════════════════════════════════");
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error("══════════════════════════════════════════════════");
    console.error("❌ [ERROR] handleUserLeft error:", error);
    console.error("══════════════════════════════════════════════════");
    return res.status(500).json({ success: false });
  }
};

// ==================== 5. ROOM CLOSE ====================
// ==================== 5. ROOM CLOSE ====================
export const handleRoomClosed = async (req, res) => {
  console.log("══════════════════════════════════════════════════");
  console.log("🔄 [WEBHOOK] ZEGO CALLBACK: Room Close");
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
  console.log("──────────────────────────────────────────────────");
  
  try {
    const { room_id, room_close_time } = req.body;
    console.log(`🔍 Looking for call with room ID: ${room_id}`);
    console.log(`⏰ Room closed at: ${room_close_time}`);
    
    // Find call by room ID
    const call = await Calling.findOne({ zegoRoomId: room_id });
    if (!call) {
      console.log(`⚠️ No call found for room: ${room_id}`);
      console.log("📤 Sending response to Zego");
      console.log("══════════════════════════════════════════════════");
      return res.status(200).json({ success: true });
    }
    
    console.log(`✅ Found call: ${call._id}, Status: ${call.status}`);
    
    // ✅ Clear monitoring interval if exists
    if (activeIntervals.has(call._id.toString())) {
      clearInterval(activeIntervals.get(call._id.toString()));
      activeIntervals.delete(call._id.toString());
      console.log(`✅ Cleared coins monitoring interval for call ${call._id}`);
    }
    
    // ✅ Clear billing timer if exists
    if (billingTimers.has(call._id.toString())) {
      clearInterval(billingTimers.get(call._id.toString()));
      billingTimers.delete(call._id.toString());
      console.log(`✅ Cleared billing timer for call ${call._id}`);
    }
    
    // ✅ Clear call timeout if exists
    if (activeCallTimeouts.has(call._id.toString())) {
      clearTimeout(activeCallTimeouts.get(call._id.toString()));
      activeCallTimeouts.delete(call._id.toString());
      console.log(`✅ Cleared call timeout for call ${call._id}`);
    }
    
    // If call is active, end it
    if (call.status === "ACTIVE") {
      console.log("🎯 Processing room closure for active call...");
      
      // FIX: Parse room_close_time safely
      let endTime = new Date();
      if (room_close_time) {
        try {
          const closeTime = parseInt(room_close_time);
          if (!isNaN(closeTime)) {
            endTime = new Date(closeTime);
          }
        } catch (timeError) {
          endTime = new Date();
        }
      }
      
      const startTime = call.startedAt || new Date();
      const durationSeconds = Math.floor((endTime - startTime) / 1000);
      const durationMinutes = Math.ceil(durationSeconds / 60);
      
      console.log(`⏱️ Call Duration:`);
      console.log(`   Start: ${startTime}`);
      console.log(`   End: ${endTime}`);
      console.log(`   Duration: ${durationSeconds} seconds`);
      console.log(`   Rounded Minutes: ${durationMinutes} minutes`);
      console.log(`💰 Rate: ${COINS_PER_MINUTE} coins per minute`);
      
      // Calculate remaining coins
      const totalCoinsNeeded = durationMinutes * COINS_PER_MINUTE;
      const remainingCoins = totalCoinsNeeded - call.coinsDeducted;
      
      console.log(`💰 Coin Calculation:`);
      console.log(`   Already deducted: ${call.coinsDeducted} coins`);
      console.log(`   Total needed: ${totalCoinsNeeded} coins (${durationMinutes} mins × ${COINS_PER_MINUTE})`);
      console.log(`   Remaining: ${remainingCoins} coins`);
      
      if (remainingCoins > 0) {
        console.log("💰 Deducting remaining coins...");
        const sender = await User.findById(call.senderId);
        
        if (sender) {
          const senderCoins = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
          
          // ✅ Check if sender has enough coins
          if (senderCoins < remainingCoins) {
            console.log(`⚠️ Sender has insufficient coins: ${senderCoins} < ${remainingCoins}`);
            console.log(`📱 Sending recharge notification to sender`);
            await sendRechargeNotification(sender._id, remainingCoins - senderCoins);
            
            // Deduct whatever coins are available
            const coinsToDeduct = Math.min(senderCoins, remainingCoins);
            
            if (coinsToDeduct > 0) {
              // Deduct from sender
              const senderBefore = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
              if (sender.totalCoins !== undefined) {
                sender.totalCoins -= coinsToDeduct;
                if (sender.totalCoins < 0) sender.totalCoins = 0;
              } else {
                sender.wallet -= coinsToDeduct;
                if (sender.wallet < 0) sender.wallet = 0;
              }
              
              let femaleCredited = 0;
              let adminCredited = 0;
              
              // Credit female receiver and admin if applicable
              if (call.isReceiverFemale) {
                const receiver = await User.findById(call.receiverId);
                if (receiver) {
                  // Female gets 60%
                  const femaleShare = Math.floor((coinsToDeduct * FEMALE_PERCENTAGE) / 100);
                  // Admin gets 40%
                  const adminShare = coinsToDeduct - femaleShare;
                  
                  if (receiver.totalCoins !== undefined) {
                    receiver.totalCoins += femaleShare;
                  } else {
                    receiver.wallet += femaleShare;
                  }
                  
                  // Credit to admin wallet
                  await addToAdminWallet(
                    adminShare,
                    `Commission from call ${call._id} (room closed, partial)`,
                    sender._id,
                    call._id
                  );
                  
                  femaleCredited = femaleShare;
                  adminCredited = adminShare;
                  
                  console.log(`💸 Partial distribution:`);
                  console.log(`   Female receiver: ${femaleShare} coins (${FEMALE_PERCENTAGE}%)`);
                  console.log(`   Admin wallet: ${adminShare} coins (${ADMIN_PERCENTAGE}%)`);
                  
                  await addTransactionToHistory(receiver._id, "credited", femaleShare, `Partial from call (room closed) with ${sender.name || sender.mobile}`);
                  await receiver.save();
                }
              } else {
                // Male→Male call: 100% to admin
                await addToAdminWallet(
                  coinsToDeduct,
                  `Commission from call ${call._id} (Male→Male, room closed, partial)`,
                  sender._id,
                  call._id
                );
                adminCredited = coinsToDeduct;
                console.log(`💸 All ${coinsToDeduct} coins to admin (Male→Male call, room closed)`);
              }
              
              await addTransactionToHistory(sender._id, "debited", coinsToDeduct, `Partial call (room closed) to ${call.receiverId}`);
              await sender.save();
              
              call.coinsDeducted += coinsToDeduct;
              call.femaleCredited = (call.femaleCredited || 0) + femaleCredited;
              call.adminCredited = (call.adminCredited || 0) + adminCredited;
              console.log(`💰 Partial deduction: ${coinsToDeduct} coins (due to insufficient balance)`);
            }
          } else {
            // Normal case: Sender has enough coins
            console.log(`✅ Sender has sufficient coins: ${senderCoins} >= ${remainingCoins}`);
            
            // Deduct from sender
            const senderBefore = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
            if (sender.totalCoins !== undefined) {
              sender.totalCoins -= remainingCoins;
              if (sender.totalCoins < 0) sender.totalCoins = 0;
            } else {
              sender.wallet -= remainingCoins;
              if (sender.wallet < 0) sender.wallet = 0;
            }
            
            let femaleCredited = 0;
            let adminCredited = 0;
            
            // Credit female receiver and admin if applicable
            if (call.isReceiverFemale) {
              const receiver = await User.findById(call.receiverId);
              if (receiver) {
                // Female gets 60%
                const femaleShare = Math.floor((remainingCoins * FEMALE_PERCENTAGE) / 100);
                // Admin gets 40%
                const adminShare = remainingCoins - femaleShare;
                
                if (receiver.totalCoins !== undefined) {
                  receiver.totalCoins += femaleShare;
                } else {
                  receiver.wallet += femaleShare;
                }
                
                // Credit to admin wallet
                await addToAdminWallet(
                  adminShare,
                  `Commission from call ${call._id} (room closed, Male→Female)`,
                  sender._id,
                  call._id
                );
                
                femaleCredited = femaleShare;
                adminCredited = adminShare;
                
                console.log(`💸 Distribution:`);
                console.log(`   Female receiver: ${femaleShare} coins (${FEMALE_PERCENTAGE}%)`);
                console.log(`   Admin wallet: ${adminShare} coins (${ADMIN_PERCENTAGE}%)`);
                
                await addTransactionToHistory(receiver._id, "credited", femaleShare, `Call (room closed) with ${sender.name || sender.mobile}`);
                await receiver.save();
              }
            } else {
              // Male→Male call: 100% to admin
              await addToAdminWallet(
                remainingCoins,
                `Commission from call ${call._id} (Male→Male, room closed)`,
                sender._id,
                call._id
              );
              adminCredited = remainingCoins;
              console.log(`💸 All ${remainingCoins} coins to admin (Male→Male call, room closed)`);
            }
            
            await addTransactionToHistory(sender._id, "debited", remainingCoins, `Call (room closed) to ${call.receiverId}`);
            await sender.save();
            
            call.coinsDeducted = totalCoinsNeeded;
            call.femaleCredited = (call.femaleCredited || 0) + femaleCredited;
            call.adminCredited = (call.adminCredited || 0) + adminCredited;
            console.log(`💰 Full deduction: ${remainingCoins} coins from sender`);
          }
        }
      } else {
        console.log("✅ No additional coins to deduct");
      }
      
      // Update call
      call.status = "ENDED";
      call.type = "call_ended_room_closed";
      call.endedAt = endTime;
      call.duration = durationSeconds;
      await call.save();
      
      console.log(`✅ Call ${call._id} ended (room closed)`);
      console.log(`📊 Final Call Status: ${call.status}, Type: ${call.type}, Duration: ${call.duration}s`);
      
      // Show admin balance
      const adminBalance = await getAdminBalance();
      console.log(`💰 Current Admin wallet balance: ${adminBalance} coins`);
    } else {
      console.log(`ℹ️ Call status is ${call.status}, skipping processing`);
    }
    
    console.log("📤 Sending success response to Zego");
    console.log("══════════════════════════════════════════════════");
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error("══════════════════════════════════════════════════");
    console.error("❌ [ERROR] handleRoomClosed error:", error);
    console.error("══════════════════════════════════════════════════");
    return res.status(500).json({ success: false });
  }
};

// ==================== 6. STREAM CREATED ====================
export const handleStreamCreated = async (req, res) => {
  console.log("══════════════════════════════════════════════════");
  console.log("🔄 [WEBHOOK] ZEGO CALLBACK: Stream Created");
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
  console.log("──────────────────────────────────────────────────");
  
  try {
    const { room_id, user_id, stream_id, create_time } = req.body;
    console.log(`🔍 Looking for call with room ID: ${room_id}`);
    console.log(`📹 Stream ID: ${stream_id}, User: ${user_id}`);
    
    const call = await Calling.findOne({ zegoRoomId: room_id });
    if (call) {
      console.log(`✅ Found call: ${call._id}`);
      console.log(`📹 Stream ${stream_id} created in call ${call._id} by ${user_id}`);
      
      // Mark video call if needed
      if (call.callType === "video") {
        console.log(`🎥 Video stream started for ${call.callType} call`);
      } else {
        console.log(`🎤 Audio stream started for ${call.callType} call`);
      }
    } else {
      console.log(`⚠️ No call found for room: ${room_id}`);
    }
    
    console.log("📤 Sending success response to Zego");
    console.log("══════════════════════════════════════════════════");
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error("══════════════════════════════════════════════════");
    console.error("❌ [ERROR] handleStreamCreated error:", error);
    console.error("══════════════════════════════════════════════════");
    return res.status(500).json({ success: true });
  }
};

// ==================== 7. STREAM STOPPED ====================
export const handleStreamClosed = async (req, res) => {
  console.log("══════════════════════════════════════════════════");
  console.log("🔄 [WEBHOOK] ZEGO CALLBACK: Stream Stopped");
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
  console.log("──────────────────────────────────────────────────");
  
  try {
    const { room_id, user_id, stream_id, close_time } = req.body;
    console.log(`🔍 Looking for call with room ID: ${room_id}`);
    console.log(`📹 Stream ID: ${stream_id}, User: ${user_id}`);
    
    const call = await Calling.findOne({ zegoRoomId: room_id });
    if (call) {
      console.log(`✅ Found call: ${call._id}`);
      console.log(`📹 Stream ${stream_id} stopped in call ${call._id} by ${user_id}`);
    } else {
      console.log(`⚠️ No call found for room: ${room_id}`);
    }
    
    console.log("📤 Sending success response to Zego");
    console.log("══════════════════════════════════════════════════");
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error("══════════════════════════════════════════════════");
    console.error("❌ [ERROR] handleStreamClosed error:", error);
    console.error("══════════════════════════════════════════════════");
    return res.status(200).json({ success: true });
  }
};

// ---------------- STEP 2: Monitor Call ----------------
const monitorCallWithSDK = async (callId, roomId, senderZegoId, receiverZegoId) => {
  const call = await Calling.findById(callId);
  if (!call || call.status !== "RINGING") return;

  let elapsed = 0;

  const interval = setInterval(async () => {
    elapsed += POLL_INTERVAL;

    try {
      const roomUsers = await zegoService.getRoomUsers(roomId);

      const senderInRoom = roomUsers.some((u) => u.user_id === senderZegoId);
      const receiverInRoom = roomUsers.some((u) => u.user_id === receiverZegoId);

      // Both joined → ACTIVE
      if (senderInRoom && receiverInRoom) {
        call.status = "ACTIVE";
        call.type = "call_accepted";
        call.startedAt = Date.now();
        await call.save();

        clearInterval(interval);
        activeIntervals.delete(callId);

        startBillingTimer(callId);
        await notifyCallStatus(call, "Call connected");

      } else if (elapsed >= CALL_TIMEOUT) {
        // Timeout → REJECTED
        call.status = "REJECTED";
        call.type = "call_rejected";
        call.endedAt = Date.now();
        await call.save();

        clearInterval(interval);
        activeIntervals.delete(callId);

        if (senderInRoom) await zegoService.kickUser(roomId, senderZegoId);
        await notifyCallStatus(call, "Call not answered");
      }

    } catch (err) {
      console.error("Monitor error:", err);
      if (elapsed >= CALL_TIMEOUT) {
        clearInterval(interval);
        activeIntervals.delete(callId);
        const currCall = await Calling.findById(callId);
        if (currCall && currCall.status === "RINGING") {
          currCall.status = "REJECTED";
          currCall.endedAt = Date.now();
          await currCall.save();
          await notifyCallStatus(currCall, "Call failed due to error");
        }
      }
    }
  }, POLL_INTERVAL);

  activeIntervals.set(callId, interval);
};

// ---------------- STEP 3: Billing Timer ----------------
const startBillingTimer = async (callId) => {
  const timer = setInterval(async () => {
    const call = await Calling.findById(callId);
    if (!call || call.status !== "ACTIVE") {
      clearInterval(timer);
      billingTimers.delete(callId);
      return;
    }

    const sender = await User.findById(call.senderId);
    const receiver = await User.findById(call.receiverId);

    if (!sender || !receiver) {
      await endCallManually(callId, "User not found");
      clearInterval(timer);
      billingTimers.delete(callId);
      return;
    }

    if (sender.wallet <= 0 || receiver.wallet <= 0) {
      await endCallDueToZeroCoins(callId);
      clearInterval(timer);
      billingTimers.delete(callId);
      return;
    }

    sender.wallet -= 1;
    receiver.wallet -= 1;
    await sender.save();
    await receiver.save();

    call.coinsDeducted += 1;
    call.duration = call.duration ? call.duration + 60 : 60;
    await call.save();

    console.log(`Billing: Deducted 1 coin for call ${callId}`);
  }, BILL_INTERVAL);

  billingTimers.set(callId, timer);
};

// ---------------- STEP 4: End Call (Zero Coins) ----------------
const endCallDueToZeroCoins = async (callId) => {
  const call = await Calling.findById(callId);
  if (!call) return;

  call.status = "ENDED";
  call.type = "call_ended_insufficient_coins";
  call.endedAt = Date.now();
  await call.save();

  if (call.zegoRoomId) {
    await Promise.all([
      zegoService.kickUser(call.zegoRoomId, call.senderZegoId),
      zegoService.kickUser(call.zegoRoomId, call.receiverZegoId),
    ]);
  }

  await notifyCallStatus(call, "Call ended due to insufficient coins");
};

// ---------------- STEP 5: Manual End Call ----------------
export const endCall = async (req, res) => {
  const { callId, userId } = req.body;

  const call = await Calling.findById(callId);
  if (!call) return res.status(404).json({ success: false, message: "Call not found" });

  if (call.senderId.toString() !== userId && call.receiverId.toString() !== userId)
    return res.status(403).json({ success: false, message: "Not authorized" });

  call.status = "ENDED";
  call.type = "call_ended_by_user";
  call.endedAt = Date.now();
  await call.save();

  if (activeIntervals.has(callId)) {
    clearInterval(activeIntervals.get(callId));
    activeIntervals.delete(callId);
  }
  if (billingTimers.has(callId)) {
    clearInterval(billingTimers.get(callId));
    billingTimers.delete(callId);
  }

  if (call.zegoRoomId) {
    await Promise.all([
      zegoService.kickUser(call.zegoRoomId, call.senderZegoId),
      zegoService.kickUser(call.zegoRoomId, call.receiverZegoId),
    ]);
  }

  await notifyCallStatus(call, "Call ended by user");
  return res.status(200).json({ success: true, message: "Call ended", call });
};

// ---------------- STEP 6: Helper ----------------
const endCallManually = async (callId, reason) => {
  const call = await Calling.findById(callId);
  if (!call) return;

  call.status = "ENDED";
  call.type = `call_ended_${reason.toLowerCase().replace(/\s+/g, "_")}`;
  call.endedAt = Date.now();
  await call.save();

  if (call.zegoRoomId) {
    await Promise.all([
      zegoService.kickUser(call.zegoRoomId, call.senderZegoId),
      zegoService.kickUser(call.zegoRoomId, call.receiverZegoId),
    ]);
  }

  await notifyCallStatus(call, `Call ended: ${reason}`);
};

// ---------------- STEP 7: Notify Users ----------------
const notifyCallStatus = async (call, message) => {
  const sender = await User.findById(call.senderId);
  const receiver = await User.findById(call.receiverId);

  const users = [sender, receiver].filter(Boolean);

  for (let user of users) {
    if (user && user.fcmToken) {
      await sendPushNotification({
        fcmToken: user.fcmToken,
        callId: call._id.toString(),
        senderId: call.senderId.toString(),
        receiverId: call.receiverId.toString(),
        callerId: call.callerId,
        callerName: call.callerName,
        callType: call.callType,
        callStatus: call.status,
        message,
      });
    }
  }
};

// ---------------- STEP 8: Cleanup on Server Restart ----------------
export const cleanupActiveCalls = async () => {
  try {
    // End all ACTIVE calls on server restart
    const activeCalls = await Calling.find({ status: "ACTIVE" });
    
    for (const call of activeCalls) {
      call.status = "ENDED";
      call.type = "call_ended_server_restart";
      call.endedAt = Date.now();
      await call.save();
      
      if (call.zegoRoomId) {
        await Promise.all([
          zegoService.kickUser(call.zegoRoomId, call.senderZegoId),
          zegoService.kickUser(call.zegoRoomId, call.receiverZegoId)
        ]);
      }
    }
    
    console.log(`Cleaned up ${activeCalls.length} active calls`);
  } catch (error) {
    console.error("cleanupActiveCalls error:", error);
  }
};
/* =========================================================
   UPDATE CALL STATUS
========================================================= */
// export const updateCallStatus = async (req, res) => {
//   try {
//     const { callId } = req.params;
//     const { status } = req.body;

//     const call = await Calling.findById(callId);
//     if (!call) {
//       return res.status(404).json({
//         success: false,
//         message: "Call not found",
//       });
//     }

//     if (status === "accepted") {
//       call.status = "ACTIVE";
//       call.startedAt = Date.now();
//       await call.save();
//       startBillingTimer(callId);
//     } else if (status === "rejected" || status === "ended") {
//       call.status = status.toUpperCase();
//       call.endedAt = Date.now();
//       await call.save();
//     }

//     // Return full call + ZEGO info if ACTIVE
//     const senderToken = generateZegoToken(call.senderId);
//     const receiverToken = generateZegoToken(call.receiverId);

//     return res.status(200).json({
//       success: true,
//       call,
//       zego: {
//         appID: ZEGO_APP_ID,
//         roomID: call._id.toString(),
//         sender: { userID: call.senderId, token: senderToken },
//         receiver: { userID: call.receiverId, token: receiverToken },
//       },
//     });
//   } catch (error) {
//     console.error("updateCallStatus:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

// Get all calls for a user
export const getUserCalls = async (req, res) => {
  try {
    const { userId } = req.params;
    const calls = await Calling.find({ $or: [{ senderId: userId }, { receiverId: userId }] })
      .sort({ createdAt: -1 })
      .populate("senderId", "name mobile")
      .populate("receiverId", "name mobile");

    return res.status(200).json({ success: true, calls });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};



export const getUserCoins = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("totalCoins");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      totalCoins: user.totalCoins
    });

  } catch (error) {
    console.error("getUserCoins error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



export const getMyReferralCode = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("myReferralCode");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      myReferralCode: user.myReferralCode
    });

  } catch (error) {
    console.error("getMyReferralCode error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



export const getUserTransactionHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query; // credited | debited (optional)

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required"
      });
    }

    const user = await User.findById(userId).select("transactionhistyry");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    let history = user.transactionhistyry || [];

    // 🔹 filter by type if provided
    if (type) {
      history = history.filter(txn => txn.type === type);
    }

    return res.status(200).json({
      success: true,
      transactionhistyry: history
    });

  } catch (error) {
    console.error("getUserTransactionHistory error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// ==================== GET USER REFERRED REWARD ONLY ====================
export const getReferredRewardOnly = async (req, res) => {
  console.log("══════════════════════════════════════════════════");
  console.log("💰 [API CALL] GET USER REFERRED REWARD ONLY");
  console.log("──────────────────────────────────────────────────");

  try {
    const { userId } = req.params;

    console.log(`🔍 Finding user with ID: ${userId}`);

    // `myreferredrewarded` aur `totalCoins` ko select karein
    const user = await User.findById(userId).select('myreferredrewarded totalCoins');

    if (!user) {
      console.log("❌ User not found");
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    console.log(`✅ User found`);
    console.log(`💰 myreferredrewarded: ${user.myreferredrewarded}`);
    console.log(`💵 totalCoins: ${user.totalCoins}`);

    // Get the latest Coin to Rupee ratio
    const coinToRupee = await CoinToRupee.findOne().sort({ createdAt: -1 });

    if (!coinToRupee) {
      console.log("❌ Coin to Rupee ratio not found");
      return res.status(404).json({
        success: false,
        message: "Coin to Rupee ratio not found"
      });
    }

    // Fetch referral reward coins from admin settings
    const adminSettings = await AdminSettings.findOne();

    if (!adminSettings) {
      console.log("❌ Admin settings not found");
      return res.status(404).json({
        success: false,
        message: "Admin settings not found"
      });
    }

    console.log(`💵 Referral reward coins: ${adminSettings.referralRewardCoins}`);

    // Calculate the equivalent amount in Rupees
    const totalAmountInRupees = user.totalCoins / coinToRupee.coins * coinToRupee.rupees;

    console.log(`💵 Equivalent Rupees for ${user.totalCoins} coins: ₹${totalAmountInRupees}`);

    return res.status(200).json({
      success: true,
      message: "Referred reward fetched successfully",
      myreferredrewarded: user.myreferredrewarded,
      totalCoins: user.totalCoins, // Total coins
      referralRewardCoins: adminSettings.referralRewardCoins, // Referral reward coins from AdminSettings
      coinToRupee: { // Coin to Rupee ratio
        coins: coinToRupee.coins,
        rupees: coinToRupee.rupees
      }
    });

  } catch (error) {
    console.error("══════════════════════════════════════════════════");
    console.error("❌ [ERROR] getReferredRewardOnly error:", error);
    console.error("══════════════════════════════════════════════════");

    return res.status(500).json({
      success: false,
      message: "Error fetching referred reward",
      error: error.message
    });
  }
};


// 1️⃣ Create Redeem Request (female only)
export const createRedeemRequest = async (req, res) => {
  try {
    const { userId, coins, upiId } = req.body;

    if (!userId || !coins || !upiId) {
      return res.status(400).json({ success: false, message: "userId, coins & upiId are required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.gender !== "female") return res.status(403).json({ success: false, message: "Only female users can redeem coins" });
    if (user.totalCoins < coins) return res.status(400).json({ success: false, message: `Insufficient coins. You have ${user.totalCoins} coins` });
    if (coins < 10) return res.status(400).json({ success: false, message: "Minimum 10 coins required to redeem" });

    // Fetch the latest Coin to Rupee ratio dynamically
    const coinToRupee = await CoinToRupee.findOne().sort({ createdAt: -1 });

    if (!coinToRupee) {
      return res.status(404).json({
        success: false,
        message: "Coin to Rupee conversion rate not found"
      });
    }

    // Calculate the equivalent amount in Rupees based on the current rate
    const amount = coins / coinToRupee.coins * coinToRupee.rupees;

    // Deduct coins from user
    user.totalCoins -= coins;

    // Add transaction history entry
    const transactionEntry = {
      type: "debited",
      coins,
      amount
    };
    user.transactionhistyry = user.transactionhistyry || [];
    user.transactionhistyry.push(transactionEntry);

    await user.save();

    // Create a redeem request
    const redeemRequest = await Redeem.create({
      userId,
      coins,
      amount,
      upiId,
      status: "process"
    });

   // ✅ ADMIN NOTIFICATION: New redeem request
    await createAdminNotification({
      title: "💸 New Redeem Request",
      body: `${user.name || user.mobile} requested to redeem ${coins} coins (₹${amount})`,
      type: 'redeem_request',
      relatedUser: userId,
      relatedData: {
        redeemId: redeemRequest._id,
        coins,
        amount,
        upiId,
        userCoinsAfterDeduction: user.totalCoins
      },
      priority: 'high'
    });

    return res.status(201).json({
      success: true,
      message: "Redeem request created successfully",
      redeemRequest
    });

  } catch (error) {
    console.error("createRedeemRequest error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// 2️⃣ Get all redeem requests (no userId filter)
export const getAllRedeemRequests = async (req, res) => {
  try {
    const requests = await Redeem.find().populate("userId", "name gender totalCoins");

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests
    });

  } catch (error) {
    console.error("getAllRedeemRequests error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3️⃣ Get redeem requests for a specific user
export const getUserRedeemRequests = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) return res.status(400).json({ success: false, message: "userId is required" });

    const requests = await Redeem.find({ userId }).populate("userId", "name gender totalCoins");

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests
    });

  } catch (error) {
    console.error("getUserRedeemRequests error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4️⃣ Update redeem request status (admin)
export const updateRedeemRequestStatus = async (req, res) => {
  try {
    const { redeemId } = req.params;
    const { status } = req.body;

    if (!["completed", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'completed' or 'rejected'" });
    }

    const redeemRequest = await Redeem.findById(redeemId);
    if (!redeemRequest) return res.status(404).json({ success: false, message: "Redeem request not found" });

    redeemRequest.status = status;
    await redeemRequest.save();

    return res.status(200).json({ success: true, message: `Redeem request ${status} successfully`, redeemRequest });

  } catch (error) {
    console.error("updateRedeemRequestStatus error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};





// Get Notifications Controller
export const getNotifications = async (req, res) => {
  try {
    const { userId } = req.params; // userId should be passed in the request params

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    // Fetch the user by userId
    const user = await User.findById(userId).select("notifications");
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Return the user's notifications
    return res.status(200).json({
      success: true,
      message: "Notifications fetched successfully",
      notifications: user.notifications, // returning all notifications of the user
    });

  } catch (error) {
    console.error("❌ getNotifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
