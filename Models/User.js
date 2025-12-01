import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // Basic Profile Fields
    name: { type: String },
    email: { type: String },
    password: { type: String },
    mobile: { type: String, unique: true },
    profileImage: { type: String },
    nickname: { type: String },
    gender: { type: String },

    dob: {
      type: Date,
      default: null,
    },

    referralCode: {
      type: String,
      default: null,
    },

    language: {
      type: String,
      default: "English",
    },

    userType: {
      type: String,
      default: "user",
    },

    wallet: {
      type: Number,
      default: 0,
    },

    // ----------------------------
    // 📌 LOCATION (GeoJSON Format)
    // ----------------------------
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0.0, 0.0],
      },
    },

    hasCompletedProfile: { type: Boolean, default: false },
    hasLoggedIn: { type: Boolean, default: false },

    // ----------------------------
    // 📌 OTP LOGIN SYSTEM
    // ----------------------------
    otp: { type: String },
    token: { type: String },
    expiresAt: { type: Date },

    // ----------------------------
    // ⚠️ WARNING SYSTEM
    // ----------------------------

    warningsCount: {
      type: Number,
      default: 0, // how many warnings user received
    },

    // TEMPORARY ACCOUNT BLOCK (24 hours after 3 warnings)
    isTemporarilyBlocked: {
      type: Boolean,
      default: false,
    },

    temporaryBlockExpiresAt: {
      type: Date,
      default: null,
    },

    // PERMANENT ACCOUNT BLOCK (after 5 warnings)
    isPermanentlyBlocked: {
      type: Boolean,
      default: false,
    }

  },
  { timestamps: true }
);

// ⭐ Required for geolocation queries
userSchema.index({ location: "2dsphere" });

const User = mongoose.model("User", userSchema);
export default User;
