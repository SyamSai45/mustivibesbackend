import mongoose from "mongoose";

const coinPackageSchema = new mongoose.Schema(
  {
    coins: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("CoinPackage", coinPackageSchema);
