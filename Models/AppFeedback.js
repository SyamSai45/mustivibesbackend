import mongoose from "mongoose";

const appFeedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true // 🔒 one feedback per user
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },

    experience: {
      type: String,
      required: true,
      trim: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("AppFeedback", appFeedbackSchema);
