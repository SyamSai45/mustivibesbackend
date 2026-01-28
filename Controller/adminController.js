import mongoose from "mongoose";
import CoinPackage from "../Models/CoinPackage.js";
import Moderation from "../Models/Warnig.js";
import User from "../Models/User.js";
import AdminSettings from "../Models/AdminSettings.js";

/* ================= CREATE ================= */
export const createCoinPackage = async (req, res) => {
  try {
    const { coins, price } = req.body;

    if (!coins || !price) {
      return res.status(400).json({
        success: false,
        message: "Coins and price are required",
      });
    }

    const pack = await CoinPackage.create({
      coins,
      price,
    });

    return res.status(201).json({
      success: true,
      message: "Coin package created successfully",
      data: pack,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= READ ALL ================= */
export const getAllCoinPackages = async (req, res) => {
  try {
    const packs = await CoinPackage.find({ isActive: true }).sort({ coins: 1 });

    return res.json({
      success: true,
      total: packs.length,
      data: packs,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= READ ONE ================= */
export const getCoinPackageById = async (req, res) => {
  try {
    const { packageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid packageId",
      });
    }

    const pack = await CoinPackage.findById(packageId);

    if (!pack) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    return res.json({
      success: true,
      data: pack,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= UPDATE ================= */
export const updateCoinPackage = async (req, res) => {
  try {
    const { packageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid packageId",
      });
    }

    const pack = await CoinPackage.findByIdAndUpdate(
      packageId,
      req.body,
      { new: true, runValidators: true }
    );

    if (!pack) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    return res.json({
      success: true,
      message: "Package updated successfully",
      data: pack,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= DELETE (SOFT DELETE) ================= */
export const deleteCoinPackage = async (req, res) => {
  try {
    const { packageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid packageId",
      });
    }

    const pack = await CoinPackage.findByIdAndUpdate(
      packageId,
      { isActive: false },
      { new: true }
    );

    if (!pack) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    return res.json({
      success: true,
      message: "Package deactivated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// ---------------------------------------------------
// 2️⃣ ADMIN HANDLES REPORT (APPROVE or REJECT)
// ---------------------------------------------------
export const handleReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action, adminComment } = req.body;

    const report = await Moderation.findById(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    const user = await User.findById(report.reportedUser);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Reported user not found"
      });
    }

    // ❌ If already permanently blocked → cannot add more warnings
    if (user.isPermanentlyBlocked) {
      return res.status(200).json({
        success: true,
        message: "User already permanently blocked. No further warnings allowed."
      });
    }

    // 🚫 Prevent re-approving the same report
    if (report.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "This report is already approved"
      });
    }

    // -------------------------
    // REJECT REPORT
    // -------------------------
    if (action === "reject") {
      report.status = "rejected";
      report.adminComment = adminComment || "Rejected by admin";

      await report.save();

      return res.status(200).json({
        success: true,
        message: "Report rejected",
        report
      });
    }

    // -------------------------
    // APPROVE REPORT → ADD WARNING
    // -------------------------
    if (action === "approve") {

      // 🚫 Hard limit guard (MAX = 5)
      if (user.warningsCount >= 5) {
        user.warningsCount = 5;
        user.isPermanentlyBlocked = true;
        user.isTemporarilyBlocked = false;
        user.temporaryBlockExpiresAt = null;

        await user.save();

        return res.status(200).json({
          success: true,
          message: "Maximum warning limit reached (5). User permanently blocked."
        });
      }

      // approve report
      report.status = "approved";
      report.adminComment = adminComment || "Approved by admin";
      report.isWarning = true;

      // Increase warning count (safe now)
      user.warningsCount += 1;

      // TEMPORARY BLOCK FOR WARNING 3 & 4
      if (user.warningsCount === 3 || user.warningsCount === 4) {
        user.isTemporarilyBlocked = true;
        user.temporaryBlockExpiresAt = new Date(
          Date.now() + 24 * 60 * 60 * 1000
        );
      }

      // PERMANENT BLOCK AT WARNING 5
      if (user.warningsCount === 5) {
        user.isPermanentlyBlocked = true;
        user.isTemporarilyBlocked = false;
        user.temporaryBlockExpiresAt = null;
      }

      await report.save();
      await user.save();

      return res.status(200).json({
        success: true,
        message:
          user.warningsCount === 5
            ? "Report approved. User permanently blocked (5 warnings)."
            : "Report approved. Warning added to user.",
        warningsCount: user.warningsCount,
        userStatus: {
          isTemporarilyBlocked: user.isTemporarilyBlocked,
          temporaryBlockExpiresAt: user.temporaryBlockExpiresAt,
          isPermanentlyBlocked: user.isPermanentlyBlocked
        },
        report
      });
    }

    // -------------------------
    // INVALID ACTION
    // -------------------------
    return res.status(400).json({
      success: false,
      message: "Invalid action. Use approve/reject."
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// ---------------------------------------------------
// 3️⃣ GET ALL REPORTS
// ---------------------------------------------------
export const getAllReports = async (req, res) => {
  try {
    const reports = await Moderation.find()
      .populate("reportedBy", "name mobile")
      .populate("reportedUser", "name mobile")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------
// 4️⃣ GET ALL WARNINGS (admin)
// ---------------------------------------------------
export const getAllWarnings = async (req, res) => {
  try {
    const warnings = await Moderation.find({ isWarning: true })
      .populate("reportedUser", "name mobile")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: warnings.length,
      warnings,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getReportById = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await Moderation.findById(reportId)
      .populate("reportedBy", "name mobile profileImage")
      .populate("reportedUser", "name mobile profileImage");

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    return res.status(200).json({
      success: true,
      report
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ---------------------------------------------------
// 5️⃣ DELETE REPORT
// ---------------------------------------------------
export const deleteReport = async (req, res) => {
  try {
    const { reportId } = req.params;

    const deleted = await Moderation.findByIdAndDelete(reportId);
    if (!deleted)
      return res.status(404).json({ success: false, message: "Report not found" });

    return res.status(200).json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------
// ADMIN DELETE USER (PERMANENT)
// ---------------------------------------------
export const adminDeleteUser = async (req, res) => {
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
      message: "User permanently deleted"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ================= CREATE / SET REFERRAL COINS ================= */
export const setReferralCoins = async (req, res) => {
  try {
    const { coins } = req.body;

    if (coins === undefined || coins < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid coins value required"
      });
    }

    let settings = await AdminSettings.findOne();

    if (!settings) {
      settings = await AdminSettings.create({ referralRewardCoins: coins });
    } else {
      settings.referralRewardCoins = coins;
      await settings.save();
    }

    return res.status(200).json({
      success: true,
      message: "Referral coins saved successfully",
      data: settings
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ================= GET ALL ================= */
export const getAllReferralCoins = async (req, res) => {
  try {
    const settings = await AdminSettings.find();

    return res.status(200).json({
      success: true,
      count: settings.length,
      data: settings
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ================= GET BY ID ================= */
export const getReferralCoinsById = async (req, res) => {
  try {
    const { id } = req.params;

    const settings = await AdminSettings.findById(id);

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Settings not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: settings
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ================= UPDATE BY ID ================= */
export const updateReferralCoinsById = async (req, res) => {
  try {
    const { id } = req.params;
    const { coins } = req.body;

    if (coins === undefined || coins < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid coins value required"
      });
    }

    const settings = await AdminSettings.findByIdAndUpdate(
      id,
      { referralRewardCoins: coins },
      { new: true }
    );

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Settings not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Referral coins updated successfully",
      data: settings
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ================= DELETE ================= */
export const deleteReferralCoins = async (req, res) => {
  try {
    const { id } = req.params;

    const settings = await AdminSettings.findByIdAndDelete(id);

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Settings not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Referral settings deleted successfully"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};