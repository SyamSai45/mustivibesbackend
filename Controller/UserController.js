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
      } catch (e) { }
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }


    // ✅ REFERRAL CODE VALIDATION (if provided)
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
      // ✅ GET ADMIN COINS
      let settings = await AdminSettings.findOne();
      let rewardCoins = settings?.referralRewardCoins || 0;

      // ✅ ADD COINS
      user.wallet += rewardCoins;
      referrer.wallet += rewardCoins;

      user.usedReferralCode = referralCode;
      user.hasUsedReferral = true;

      referrer.referralUsedBy.push(userId);
      await referrer.save();
    }

    user.profileImage = uploadResponse.secure_url;
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

    // ✅ USE sanitizeUser function to remove unwanted fields
    return res.status(200).json({
      success: true,
      message: "Profile updated successfully. Now update location.",
      goTo: "updateLocation",
      user: sanitizeUser(user)  // ✅ This removes referralUsedBy, otp, token
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

    console.log("📥 followUser called with:", { userId, followId });

    // 1️⃣ Validation
    if (!userId || !followId) {
      console.warn("⚠️ Missing userId or followId");
      return res.status(400).json({
        success: false,
        message: "userId and followId required",
      });
    }

    if (userId === followId) {
      console.warn("⚠️ User tried to follow themselves");
      return res.status(400).json({
        success: false,
        message: "You cannot follow yourself",
      });
    }

    // 2️⃣ Fetch users
    const user = await User.findById(userId).select("name following");
    const followUser = await User.findById(followId).select("name followers fcmToken");

    if (!user || !followUser) {
      console.error("❌ User not found:", { user, followUser });
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("👤 Users fetched:", { userName: user.name, followUserName: followUser.name });

    // 3️⃣ Already followed check
    if (user.following.includes(followId)) {
      console.warn(`⚠️ Already following ${followUser.name}`);
      return res.status(400).json({
        success: false,
        message: `You already follow ${followUser.name}`,
      });
    }

    // 4️⃣ Update DB
    await User.updateOne(
      { _id: userId },
      { $addToSet: { following: followId } }
    );
    await User.updateOne(
      { _id: followId },
      { $addToSet: { followers: userId } }
    );

    console.log(`✅ Updated DB: ${user.name} is now following ${followUser.name}`);

    // 5️⃣ Send push notification
    if (followUser.fcmToken) {
      console.log("📤 Sending push to FCM token:", followUser.fcmToken);
      try {
        const pushResponse = await sendSimplePush({
          fcmToken: followUser.fcmToken,
          title: "New Follower 🎉",
          body: `${user.name} started following you`,
          data: {
            type: "follow",
            userId: userId.toString(),
          },
        });
        console.log("🔔 Push response:", pushResponse);
      } catch (pushError) {
        console.error("❌ Push notification failed:", pushError);
      }
    } else {
      console.warn("⚠️ No FCM token found for user:", followUser._id);
    }

    return res.status(200).json({
      success: true,
      message: `You followed ${followUser.name} successfully`,
    });

  } catch (error) {
    console.error("❌ followUser server error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ====================== UNFOLLOW USER ====================== */
export const unfollowUser = async (req, res) => {
  try {
    const { userId, followId } = req.body;

    // 1️⃣ Validation
    if (!userId || !followId) {
      return res.status(400).json({
        success: false,
        message: "userId and followId required",
      });
    }

    // 2️⃣ Fetch users
    const user = await User.findById(userId).select("name following");
    const followUser = await User.findById(followId).select("name followers fcmToken");

    if (!user || !followUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 3️⃣ Not following check
    if (!user.following.includes(followId)) {
      return res.status(400).json({
        success: false,
        message: `You are not following ${followUser.name}`,
      });
    }

    // 4️⃣ Update DB
    await User.updateOne(
      { _id: userId },
      { $pull: { following: followId } }
    );

    await User.updateOne(
      { _id: followId },
      { $pull: { followers: userId } }
    );

    // 5️⃣ Simple Push Notification
    if (followUser.fcmToken) {
      await sendSimplePush({
        fcmToken: followUser.fcmToken,
        title: "Follower Update",
        body: `${user.name} unfollowed you`,
        data: {
          type: "unfollow",
          userId: userId.toString(),
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `You unfollowed ${followUser.name} successfully`,
    });

  } catch (error) {
    console.error("❌ unfollowUser error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
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


/* ---------------------------------------------
   UNBLOCK USER
--------------------------------------------- */
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



const ZEGO_APP_ID = "1837791744";
const ZEGO_SERVER_SECRET = "f45d2d08b7c9085571347535acf61177";
// const MIN_COINS = 1;
// const BILL_INTERVAL = 60 * 1000; // 1 minute
// const POLL_INTERVAL = 5000; // 5 seconds
// const CALL_TIMEOUT = 60 * 1000; // 1 minute

// ---------------- CONFIG ----------------
const MIN_COINS = 10;
const POLL_INTERVAL = 3000; // 3 sec
const CALL_TIMEOUT = 60000; // 60 sec
const BILL_INTERVAL = 60000; // 1 min

// Store active intervals
const activeIntervals = new Map();
const billingTimers = new Map();

// ---------------- STEP 1: Initiate Call ----------------
export const sendCallingRequest = async (req, res) => {
  try {
    const { senderId, receiverId, callerId, callType } = req.body;

    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);

    if (!sender || !receiver)
      return res.status(404).json({ success: false, message: "User not found" });

    if (sender.wallet < MIN_COINS || receiver.wallet < MIN_COINS)
      return res.status(400).json({ success: false, message: "Not enough coins to start call" });

    const callerName = sender.name || sender.mobile || "Someone";
    const zegoRoomId = `room_${Date.now()}_${senderId}_${receiverId}`;
    const senderToken = zegoService.generateToken(`user_${senderId}`, zegoRoomId);
    const receiverToken = zegoService.generateToken(`user_${receiverId}`, zegoRoomId);

    if (!senderToken || !receiverToken)
      return res.status(500).json({ success: false, message: "Failed to generate call tokens" });

    const call = await Calling.create({
      senderId,
      receiverId,
      callerId,
      callType,
      callerName,
      zegoRoomId,
      senderZegoId: `user_${senderId}`,
      receiverZegoId: `user_${receiverId}`,
      fcmToken: receiver.fcmToken || null,
      status: "RINGING",
      type: "incoming_call",
      coinsDeducted: 0,
    });

    // Push to receiver
    if (receiver.fcmToken) {
      await sendPushNotification({
        fcmToken: receiver.fcmToken,
        callId: call._id.toString(),
        senderId,
        receiverId,
        callerId,
        callerName,
        callType,
        zegoData: {
          roomId: zegoRoomId,
          token: receiverToken,
          appId: process.env.ZEGO_APP_ID,
          userId: `user_${receiverId}`,
          server: "wss://webliveroom1837791744-api.coolzcloud.com/ws",
          backupServer: "wss://webliveroom1837791744-api-bak.coolzcloud.com/ws",
        },
      });
    }

    monitorCallWithSDK(call._id, zegoRoomId, `user_${senderId}`, `user_${receiverId}`);

    return res.status(201).json({
      success: true,
      message: "Call initiated successfully",
      call,
      callerName,
      zegoCredentials: {
        sender: {
          appId: process.env.ZEGO_APP_ID,
          roomId: zegoRoomId,
          token: senderToken,
          userId: `user_${senderId}`,
          server: "wss://webliveroom1837791744-api.coolzcloud.com/ws",
          backupServer: "wss://webliveroom1837791744-api-bak.coolzcloud.com/ws",
        },
        receiver: {
          appId: process.env.ZEGO_APP_ID,
          roomId: zegoRoomId,
          token: receiverToken,
          userId: `user_${receiverId}`,
          server: "wss://webliveroom1837791744-api.coolzcloud.com/ws",
          backupServer: "wss://webliveroom1837791744-api-bak.coolzcloud.com/ws",
        },
      },
    });
  } catch (error) {
    console.error("sendCallingRequest error:", error);
    return res.status(500).json({ success: false, message: error.message });
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
export const updateCallStatus = async (req, res) => {
  try {
    const { callId } = req.params;
    const { status } = req.body;

    const call = await Calling.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    if (status === "accepted") {
      call.status = "ACTIVE";
      call.startedAt = Date.now();
      await call.save();
      startBillingTimer(callId);
    } else if (status === "rejected" || status === "ended") {
      call.status = status.toUpperCase();
      call.endedAt = Date.now();
      await call.save();
    }

    // Return full call + ZEGO info if ACTIVE
    const senderToken = generateZegoToken(call.senderId);
    const receiverToken = generateZegoToken(call.receiverId);

    return res.status(200).json({
      success: true,
      call,
      zego: {
        appID: ZEGO_APP_ID,
        roomID: call._id.toString(),
        sender: { userID: call.senderId, token: senderToken },
        receiver: { userID: call.receiverId, token: receiverToken },
      },
    });
  } catch (error) {
    console.error("updateCallStatus:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

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