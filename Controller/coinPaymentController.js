import crypto from "crypto";
import CoinPayment from "../Models/CoinPayment.js";
import CoinPackage from "../Models/CoinPackage.js";
import User from "../Models/User.js";
import razorpay from "../config/razorpay.js";
// Add at top
import createAdminNotification from "../utils/AdminNotificationService.js";
import sendSimplePush from "../utils/sendSimplePush.js"; 


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

    // 🔥 NO RAZORPAY CAPTURE
    // 🔥 NO EXISTING PAYMENT CHECK
    // 🔥 EVERY REQUEST = NEW TRANSACTION

    // 🔹 Save payment (NEW every time)
    // await CoinPayment.create({
    //   userId,
    //   packageId,
    //   razorpayPaymentId: transactionId,
    //   amount: pack.price,
    //   coins: pack.coins,
    //   status: "completed"
    // });

        const payment = await CoinPayment.create({
      userId,
      packageId,
      razorpayPaymentId: transactionId,
      amount: pack.price,
      coins: pack.coins,
      status: "completed"
    });
    // 🔹 Transaction history
    const historyEntry = {
      type: "credited",
      coins: pack.coins,
      amount: pack.price,
      transactionId
    };

    // 🔹 Add coins + history
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { totalCoins: pack.coins },
        $push: { transactionhistyry: historyEntry }
      },
      { new: true }
    );
     // ✅ ADMIN NOTIFICATION: User purchased coins
    await createAdminNotification({
      title: "💰 Coins Purchased",
      body: `User ${user.name || user.mobile} purchased ${pack.coins} coins for ₹${pack.price}`,
      type: 'payment_received',
      relatedUser: userId,
      relatedData: {
        packageId: pack._id,
        packageCoins: pack.coins,
        amount: pack.price,
        transactionId,
        paymentId: payment._id,
        newTotalCoins: user.totalCoins
      },
      priority: 'medium'
    });
    // 🔹 Create notification for user
    const coinAddedNotification = {
      title: "Coins Credited 🎉",
      body: `You have successfully received ${pack.coins} coins for the payment of ₹${pack.price}`,
      type: "coin_credited",
      createdAt: new Date(),
    };

    // Push notification to the user's notifications array
    await User.updateOne({ _id: userId }, { $push: { notifications: coinAddedNotification } });

    // 🔹 Push Notification via FCM (only if the user has an FCM token)
    if (user.fcmToken) {
      await sendSimplePush({
        fcmToken: user.fcmToken,
        title: "Coins Credited 🎉",
        body: `You have successfully received ${pack.coins} coins for the payment of ₹${pack.price}`,
        data: { type: "coin_credited", userId: userId.toString() },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coins added successfully",
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
