import mongoose from "mongoose";

const adminSettingsSchema = new mongoose.Schema(
  {
    referralRewardCoins: {
      type: Number,
      default: 10 // admin can change anytime
    }
  },
  { timestamps: true }
);

const AdminSettings = mongoose.model("AdminSettings", adminSettingsSchema);
export default AdminSettings;
