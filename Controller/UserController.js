import User from "../Models/User.js";
import { generateToken, verifyToken } from "../config/jwtToken.js";
import cloudinary from "../config/cloudinary.js";
import fs from "fs";
import nodemailer from 'nodemailer';
import { sendSms } from "../config/sendSms.js";
import { randomBytes } from "crypto";



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
    const { userId, unfollowId } = req.body;

    if (!userId || !unfollowId) {
      return res.status(400).json({
        success: false,
        message: "userId and unfollowId required"
      });
    }

    const user = await User.findById(userId);
    const unfollowUser = await User.findById(unfollowId);

    if (!user || !unfollowUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    user.following = user.following.filter(id => id.toString() !== unfollowId);
    unfollowUser.followers = unfollowUser.followers.filter(id => id.toString() !== userId);

    await user.save();
    await unfollowUser.save();

    return res.status(200).json({
      success: true,
      message: "User unfollowed successfully"
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


export const getFollowersAndFollowing = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select("name nickname mobile profileImage location followers following");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // username logic: name -> nickname -> mobile
    const username =
      user.name && user.name.trim() !== ""
        ? user.name
        : user.nickname
          ? user.nickname
          : user.mobile;

    const location = user.location
      ? {
        latitude: user.location.coordinates[1],
        longitude: user.location.coordinates[0],
      }
      : null;

    return res.status(200).json({
      success: true,
      username,
      profileImage: user.profileImage || null,
      location,
      followersCount: user.followers?.length || 0,
      followingCount: user.following?.length || 0
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
      message: "Your mastivides account has been permanently deleted"
    });

  } catch (error) {
    return res.status(200).json({
      success: true,
      message: "Your mastivides account has been permanently deleted"
    });
  }
};


