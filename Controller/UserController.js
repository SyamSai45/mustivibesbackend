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





//follow and following
export const followUser = async (req, res) => {
  try {
    const { userId, followId } = req.body;

    if (!userId || !followId) {
      return res.status(400).json({
        success: false,
        message: "userId and followId required"
      });
    }

    if (userId === followId) {
      return res.status(400).json({
        success: false,
        message: "You cannot follow yourself"
      });
    }

    const user = await User.findById(userId);
    const followUser = await User.findById(followId);

    if (!user || !followUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Already following?
    if (user.following.includes(followId)) {
      return res.status(400).json({
        success: false,
        message: "Already following this user"
      });
    }

    user.following.push(followId);
    followUser.followers.push(userId);

    await user.save();
    await followUser.save();

    return res.status(200).json({
      success: true,
      message: "User followed successfully"
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


export const unfollowUser = async (req, res) => {
  try {
    const { userId, followId } = req.body;

    if (!userId || !followId) {
      return res.status(400).json({
        success: false,
        message: "userId and followId required"
      });
    }

    // 1️⃣ Find user
    const user = await User.findById(userId).select("following name nickname profileImage");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 2️⃣ Remove ID from following array (agar present ho)
    const beforeCount = user.following.length;
    user.following = user.following.filter(id => id.toString() !== followId);
    const afterCount = user.following.length;

    const removed = beforeCount !== afterCount; // true if something was removed

    // 3️⃣ Save user
    await user.save();

    // 4️⃣ Response
    return res.status(200).json({
      success: true,
      message: removed ? "User unfollowed successfully" : "ID not found in following array",
      data: {
        _id: user._id,
        name: user.name,
        nickname: user.nickname,
        profileImage: user.profileImage,
        following: user.following
      }
    });

  } catch (error) {
    console.error("unfollowUser error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
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
export const createRequest = async (req, res) => {
  try {
    const { fromUser, toUser, type } = req.body;

    if (!fromUser || !toUser || !type) {
      return res.status(400).json({
        success: false,
        message: "fromUser, toUser, type required"
      });
    }

    if (fromUser === toUser) {
      return res.status(400).json({
        success: false,
        message: "Cannot request yourself"
      });
    }

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

    const request = await CommunicationRequest.create({
      fromUser,
      toUser,
      type
    });

    return res.status(201).json({
      success: true,
      message: "Communication request sent",
      request
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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
export const handleRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action } = req.body;

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

    if (action === "approve") {
      request.status = "approved";
    } else if (action === "reject") {
      request.status = "rejected";
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid action"
      });
    }

    await request.save();

    return res.status(200).json({
      success: true,
      message: `Request ${request.status}`,
      request
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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


export const sendCallingRequest = async (req, res) => {
  try {
    const { senderId, receiverId, callerId, callType } = req.body;

    // 1️⃣ Fetch sender (caller)
    const sender = await User.findById(senderId).select("name mobile");
    if (!sender) {
      return res.status(404).json({
        success: false,
        message: "Sender not found",
      });
    }

    const callerName = sender.name || sender.mobile || "Someone";

    // 2️⃣ Fetch receiver
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      });
    }

    // 🔹 CALL TYPE (initial)
    const type = "incoming_call"; // ✅ FIXED HERE

    // 3️⃣ Create call record
    const call = await Calling.create({
      senderId,
      receiverId,
      callerId,
      callType,
      callerName,
      fcmToken: receiver.fcmToken || null,
      status: "initiated",
      type, // ✅ STORED IN DB
    });

    // Log call object to check for _id
    console.log("Created Call Object:", call);

    // Ensure call._id exists
    if (!call || !call._id) {
      throw new Error("Failed to create a valid call record. _id is missing.");
    }

    let pushNotificationResponse = null;

    // 4️⃣ Send push notification
    if (receiver.fcmToken) {
      pushNotificationResponse = await sendPushNotification({
        fcmToken: receiver.fcmToken,
        callId: call._id.toString(),
        senderId,
        receiverId,
        callerId,
        callerName,
        callType,
      });
    }

    // Log push notification response for debugging
    console.log("Push Notification Response:", pushNotificationResponse);

    // 5️⃣ RESPONSE with push notification info
    return res.status(201).json({
      success: true,
      message: `Call initiated successfully ✅`,
      call,
      callerName,
      type, // optional but useful
      pushNotification: pushNotificationResponse ? "Notification sent successfully" : "No FCM token provided or notification failed", // Show push notification status
      pushNotificationData: pushNotificationResponse || {}, // Show notification data if sent
      notificationMessage: `You have an incoming ${callType === 'audio' ? 'audio' : 'video'} call from ${callerName}`, // New field added with the actual message
    });

  } catch (error) {
    console.error("❌ sendCallingRequest error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};




// Accept / Reject call
export const updateCallStatus = async (req, res) => {
  try {
    const { callId } = req.params;
    const { status } = req.body;

    const call = await Calling.findById(callId);
    if (!call) {
      return res.status(404).json({ success: false, message: "Call not found" });
    }

    // 🔹 Update status
    call.status = status;

    // 🔹 Handle timestamps
    if (status === "accepted") {
      call.startedAt = Date.now();
      call.type = "call_accepted";
    }

    if (status === "rejected") {
      call.endedAt = Date.now();
      call.type = "call_rejected";
    }

    if (status === "ended") {
      call.endedAt = Date.now();
      call.type = "call_ended";
    }

    if (status === "missed") {
      call.endedAt = Date.now();
      call.type = "call_missed";
    }

    // 🔹 Calculate duration
    if (call.startedAt && call.endedAt) {
      call.duration = Math.floor(
        (call.endedAt - call.startedAt) / 1000
      );
    }

    await call.save();

    // 🔔 Send Push Notification on status change
    if (call.fcmToken) {
      await sendPushNotification({
        fcmToken: call.fcmToken,
        title: "Call Update",
        body: `Call ${status}`,
        data: {
          callId: call._id.toString(),
          status,
          type: call.type,
          callerName: call.callerName,
          callType: call.callType,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Call ${status}`,
      call,
    });

  } catch (error) {
    console.error("❌ updateCallStatus error:", error);
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