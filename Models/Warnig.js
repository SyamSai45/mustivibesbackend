import mongoose from "mongoose";

const moderationSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reason: {
      type: String,
      required: true,
    },

    // pending → waiting for admin
    // approved → warning given
    // rejected → report dismissed
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    adminComment: {
      type: String,
      default: null,
    },

    // Becomes TRUE when admin approves
    isWarning: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Moderation", moderationSchema);
