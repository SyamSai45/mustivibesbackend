import crypto from "crypto";
import CoinPayment from "../Models/CoinPayment.js";
import CoinPackage from "../Models/CoinPackage.js";
import User from "../Models/User.js";
import razorpay from "../config/razorpay.js";

/* ================= CREATE ORDER ================= */
export const createCoinOrder = async (req, res) => {
  try {
    const { userId, packageId, transactionId } = req.body;

    if (!userId || !packageId || !transactionId) {
      return res.status(400).json({
        success: false,
        message: "userId, packageId and transactionId are required"
      });
    }

    // 🔹 Get package
    const pack = await CoinPackage.findById(packageId);
    if (!pack || !pack.isActive) {
      return res.status(404).json({
        success: false,
        message: "Package not found"
      });
    }

    // 🔹 Capture payment
    const payment = await razorpay.payments.capture(
      transactionId,
      pack.price * 100,
      "INR"
    );

    if (payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Payment capture failed"
      });
    }

    // 🔹 Save payment with COMPLETED status
    await CoinPayment.create({
      userId,
      packageId,
      razorpayPaymentId: transactionId,
      amount: pack.price,
      coins: pack.coins,
      status: "completed" // ✅ updated
    });

    // 🔹 Add coins to user
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { totalCoins: pack.coins } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Payment completed, coins added successfully",
      paymentId: transactionId,
      coinsAdded: pack.coins,
      totalCoins: user.totalCoins,
      status: "completed"
    });

  } catch (error) {
    console.error("createCoinOrder error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ================= VERIFY PAYMENT ================= */
export const verifyCoinPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const payment = await CoinPayment.findOne({ razorpayOrderId });
    if (!payment) return res.status(404).json({ success: false });

    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpaySignature) {
      payment.status = "failed";
      await payment.save();
      return res.status(400).json({ success: false });
    }

    payment.status = "success";
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    await payment.save();

    // 💰 ADD TO USER WALLET
    const user = await User.findById(payment.userId);
    user.wallet += payment.coins;
    await user.save();

    res.json({
      success: true,
      addedCoins: payment.coins,
      totalWalletCoins: user.wallet
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ================= READ ALL (ADMIN) ================= */
export const getAllCoinPayments = async (req, res) => {
  try {
    const payments = await CoinPayment.find({ isDeleted: false })
      .populate("userId", "name mobile wallet")
      .populate("packageId", "coins price")
      .sort({ createdAt: -1 });

    // ✅ NO PAYMENTS CASE
    if (!payments || payments.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No payments found",
        data: []
      });
    }
  

    // ✅ PAYMENTS FOUND
    return res.status(200).json({
      success: true,
      message: "Payments fetched successfully",
      count: payments.length,
      data: payments
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ================= READ BY USER ================= */
export const getUserCoinPayments = async (req, res) => {
  try {
    const { userId } = req.params;

    const payments = await CoinPayment.find({
      userId,
      isDeleted: false
    }).sort({ createdAt: -1 });

    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ================= DELETE PAYMENT (SOFT) ================= */
export const deleteCoinPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await CoinPayment.findByIdAndUpdate(
      paymentId,
      { isDeleted: true },
      { new: true }
    );

    if (!payment) return res.status(404).json({ success: false });

    res.json({ success: true, message: "Payment deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
