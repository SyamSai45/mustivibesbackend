import mongoose from "mongoose";

const coinPaymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CoinPackage",
    required: true
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  amount: Number,
  coins: Number,

  status: {
    type: String,
    enum: ["created", "success", "failed", 'completed'],
    default: "created"
  },

  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

export default mongoose.model("CoinPayment", coinPaymentSchema);
