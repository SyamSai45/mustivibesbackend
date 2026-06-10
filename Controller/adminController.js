import mongoose from "mongoose";
import CoinPackage from "../Models/CoinPackage.js";
import Moderation from "../Models/Warnig.js";
import User from "../Models/User.js";
import Admin from "../Models/Admin.js";
import Redeem from "../Models/Redeem.js";
import AdminSettings from "../Models/AdminSettings.js";
import CoinToRupee from "../Models/CoinToRupee.js";
import AdminNotification from "../Models/AdminNotification.js"
import CoinDeductionRule from "../Models/CoinDeductionRule.js";
import WarningContent from "../Models/WarningContent.js";
import Calling from "../Models/Calling.js";
import CoinPayment from "../Models/CoinPayment.js";
import Message from "../Models/Message.js";
import AppFeedback from "../Models/AppFeedback.js";
import Room from "../Models/RoomModel.js";
import CommunicationRequest from "../Models/CommunicationRequest.js";
import createAdminNotification from "../utils/AdminNotificationService.js";




// 6. MODIFIED: handleUserLeft - Add admin notification for call completion
export const handleUserLeft = async (req, res) => {
  console.log("══════════════════════════════════════════════════");
  console.log("🔄 [WEBHOOK] ZEGO CALLBACK: User Left");
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
  console.log("──────────────────────────────────────────────────");
  
  try {
    const { room_id, user_account, logout_time } = req.body;
    
    const call = await Calling.findOne({ zegoRoomId: room_id });
    if (!call) {
      return res.status(200).json({ success: true });
    }
    
    // Clear intervals (keep existing cleanup)
    if (activeIntervals.has(call._id.toString())) {
      clearInterval(activeIntervals.get(call._id.toString()));
      activeIntervals.delete(call._id.toString());
    }
    if (billingTimers.has(call._id.toString())) {
      clearInterval(billingTimers.get(call._id.toString()));
      billingTimers.delete(call._id.toString());
    }
    if (activeCallTimeouts.has(call._id.toString())) {
      clearTimeout(activeCallTimeouts.get(call._id.toString()));
      activeCallTimeouts.delete(call._id.toString());
    }
    
    if (call.status === "ACTIVE") {
      console.log("🎯 Processing active call...");
      
      const actualUserId = user_account;
      const isSender = call.senderId.toString() === actualUserId;
      const isReceiver = call.receiverId.toString() === actualUserId;
      
      if (isSender || isReceiver) {
        let endTime = new Date();
        if (logout_time) {
          try {
            const logoutTime = parseInt(logout_time);
            if (!isNaN(logoutTime)) {
              endTime = new Date(logoutTime);
            }
          } catch (timeError) {
            endTime = new Date();
          }
        }
        
        const startTime = call.startedAt || new Date();
        const durationSeconds = Math.floor((endTime - startTime) / 1000);
        const durationMinutes = Math.ceil(durationSeconds / 60);
        
        // Calculate total coins needed
        const totalCoinsNeeded = durationMinutes * COINS_PER_MINUTE;
        const remainingCoins = totalCoinsNeeded - call.coinsDeducted;
        
        // Get sender and receiver details
        const sender = await User.findById(call.senderId);
        const receiver = await User.findById(call.receiverId);
        
        // Process deductions (keep existing deduction logic)
        if (remainingCoins > 0 && sender) {
          const senderCoins = sender.totalCoins !== undefined ? sender.totalCoins : sender.wallet;
          
          if (senderCoins < remainingCoins) {
            console.log(`⚠️ Sender has insufficient coins: ${senderCoins} < ${remainingCoins}`);
            await sendRechargeNotification(sender._id, remainingCoins - senderCoins);
            
            const coinsToDeduct = Math.min(senderCoins, remainingCoins);
            
            if (coinsToDeduct > 0) {
              if (sender.totalCoins !== undefined) {
                sender.totalCoins -= coinsToDeduct;
              } else {
                sender.wallet -= coinsToDeduct;
              }
              
              let femaleCredited = 0;
              let adminCredited = 0;
              
              if (call.isReceiverFemale && receiver) {
                const femaleShare = Math.floor((coinsToDeduct * FEMALE_PERCENTAGE) / 100);
                const adminShare = coinsToDeduct - femaleShare;
                
                if (receiver.totalCoins !== undefined) {
                  receiver.totalCoins += femaleShare;
                } else {
                  receiver.wallet += femaleShare;
                }
                
                await addToAdminWallet(
                  adminShare,
                  `Commission from call ${call._id} (partial)`,
                  sender._id,
                  call._id
                );
                
                femaleCredited = femaleShare;
                adminCredited = adminShare;
                
                await addTransactionToHistory(receiver._id, "credited", femaleShare, `Partial from call with ${sender.name || sender.mobile}`);
                await receiver.save();
              } else {
                await addToAdminWallet(
                  coinsToDeduct,
                  `Commission from call ${call._id} (Male→Male, partial)`,
                  sender._id,
                  call._id
                );
                adminCredited = coinsToDeduct;
              }
              
              await addTransactionToHistory(sender._id, "debited", coinsToDeduct, `Partial call to ${call.receiverId}`);
              await sender.save();
              
              call.coinsDeducted += coinsToDeduct;
              call.femaleCredited = (call.femaleCredited || 0) + femaleCredited;
              call.adminCredited = (call.adminCredited || 0) + adminCredited;
            }
          } else {
            if (sender.totalCoins !== undefined) {
              sender.totalCoins -= remainingCoins;
            } else {
              sender.wallet -= remainingCoins;
            }
            
            let femaleCredited = 0;
            let adminCredited = 0;
            
            if (call.isReceiverFemale && receiver) {
              const femaleShare = Math.floor((remainingCoins * FEMALE_PERCENTAGE) / 100);
              const adminShare = remainingCoins - femaleShare;
              
              if (receiver.totalCoins !== undefined) {
                receiver.totalCoins += femaleShare;
              } else {
                receiver.wallet += femaleShare;
              }
              
              await addToAdminWallet(
                adminShare,
                `Commission from call ${call._id}`,
                sender._id,
                call._id
              );
              
              femaleCredited = femaleShare;
              adminCredited = adminShare;
              
              await addTransactionToHistory(receiver._id, "credited", femaleShare, `Call with ${sender.name || sender.mobile}`);
              await receiver.save();
            } else {
              await addToAdminWallet(
                remainingCoins,
                `Commission from call ${call._id} (Male→Male)`,
                sender._id,
                call._id
              );
              adminCredited = remainingCoins;
            }
            
            await addTransactionToHistory(sender._id, "debited", remainingCoins, `Call to ${call.receiverId}`);
            await sender.save();
            
            call.coinsDeducted = totalCoinsNeeded;
            call.femaleCredited = (call.femaleCredited || 0) + femaleCredited;
            call.adminCredited = (call.adminCredited || 0) + adminCredited;
          }
        }
        
        // Update call status
        call.status = "ENDED";
        call.type = isSender ? "call_ended_by_sender" : "call_ended_by_receiver";
        call.endedAt = endTime;
        call.duration = durationSeconds;
        await call.save();
        
        // ✅ ADMIN NOTIFICATION: Call completed
        if (sender && receiver) {
          const totalCoinsDeducted = call.coinsDeducted || 0;
          const adminEarned = call.adminCredited || 0;
          const femaleEarned = call.femaleCredited || 0;
          
          await createAdminNotification({
            title: "📞 Call Completed",
            body: `Call between ${sender.name || sender.mobile} and ${receiver.name || receiver.mobile} ended`,
            type: 'call_completed',
            relatedUser: call.senderId,
            relatedData: {
              callId: call._id,
              duration: durationSeconds,
              durationMinutes,
              totalCoinsDeducted,
              adminEarned,
              femaleEarned,
              senderId: call.senderId,
              receiverId: call.receiverId,
              senderName: sender.name || sender.mobile,
              receiverName: receiver.name || receiver.mobile,
              callType: call.callType,
              endedBy: isSender ? 'sender' : 'receiver'
            },
            priority: 'low'
          });
        }
        
        console.log(`✅ Call ${call._id} ended by ${isSender ? 'sender' : 'receiver'}`);
      }
    }
    
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error("❌ [ERROR] handleUserLeft error:", error);
    return res.status(500).json({ success: false });
  }
};

// ================= Update user ==============

export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
     // ✅ CHECK MONGODB CONNECTION STATUS
    if (mongoose.connection.readyState !== 1) {
      console.error("❌ MongoDB not connected. State:", mongoose.connection.readyState);
      return res.status(500).json({
        success: false,
        message: "Database connection not established",
        details: "Please check MongoDB connection"
      });
    }

    console.log("✅ MongoDB connection state:", mongoose.connection.readyState);
    const {
      name,
      nickname,
      email,
      mobile,
      gender,
      dob,
      language,
      userType,
      totalCoins,
      wallet,
      warningsCount,
      isTemporarilyBlocked,
      isPermanentlyBlocked,
      hasCompletedProfile,
      hasLoggedIn,
      isOnline,
      fcmToken
    } = req.body;

    // Validate userId
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required in params"
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Build update object with only provided fields
    const updateData = {};

    // Basic Info
    if (name !== undefined) updateData.name = name;
    if (nickname !== undefined) updateData.nickname = nickname;
    if (email !== undefined) updateData.email = email;
    if (mobile !== undefined) updateData.mobile = mobile;
    if (gender !== undefined) updateData.gender = gender;
    if (dob !== undefined) updateData.dob = dob;
    if (language !== undefined) updateData.language = language;
    if (userType !== undefined) updateData.userType = userType;
    if (fcmToken !== undefined) updateData.fcmToken = fcmToken;

    // Coin/Wallet related
    if (totalCoins !== undefined) updateData.totalCoins = totalCoins;
    if (wallet !== undefined) updateData.wallet = wallet;

    // Warning/Block related
    if (warningsCount !== undefined) updateData.warningsCount = warningsCount;
    if (isTemporarilyBlocked !== undefined) updateData.isTemporarilyBlocked = isTemporarilyBlocked;
    if (isPermanentlyBlocked !== undefined) updateData.isPermanentlyBlocked = isPermanentlyBlocked;

    // Profile status
    if (hasCompletedProfile !== undefined) updateData.hasCompletedProfile = hasCompletedProfile;
    if (hasLoggedIn !== undefined) updateData.hasLoggedIn = hasLoggedIn;
    if (isOnline !== undefined) updateData.isOnline = isOnline;

    // Handle temporary block expiry if block is being removed
    if (isTemporarilyBlocked === false && updateData.isTemporarilyBlocked === false) {
      updateData.temporaryBlockExpiresAt = null;
    }

    // Add lastActive timestamp
    updateData.lastActive = new Date();

    // Update the user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password -otp -token -deleteToken -deleteTokenExpiration -referralUsedBy');

    // ✅ ADMIN NOTIFICATION: User details updated
    await createAdminNotification({
      title: "✏️ User Details Updated",
      body: `Admin updated details for user: ${updatedUser.name || updatedUser.mobile}`,
      type: 'admin_action',
      relatedUser: userId,
      relatedData: {
        updatedFields: Object.keys(updateData),
        previousData: {
          name: user.name,
          nickname: user.nickname,
          gender: user.gender,
          totalCoins: user.totalCoins,
          warningsCount: user.warningsCount,
          isTemporarilyBlocked: user.isTemporarilyBlocked,
          isPermanentlyBlocked: user.isPermanentlyBlocked
        },
        newData: updateData
      },
      priority: 'medium'
    });

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser
    });

  } catch (error) {
    console.error("❌ updateUser error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating user",
      error: error.message
    });
  }
};

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



// Create a new Coin to Rupee Ratio
export const createCoinToRupee = async (req, res) => {
  try {
    const { coins, rupees } = req.body;

    if (!coins || !rupees) {
      return res.status(400).json({
        success: false,
        message: "coins and rupees are required"
      });
    }

    // Create new CoinToRupee entry
    const newRatio = new CoinToRupee({
      coins,
      rupees,
    });

    // Save the entry
    await newRatio.save();

    return res.status(201).json({
      success: true,
      message: "Coin to Rupee ratio created successfully",
      newRatio
    });

  } catch (error) {
    console.error("createCoinToRupee error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


export const editCoinToRupee = async (req, res) => {
  try {
    const { ratioId } = req.params;
    const { coins, rupees } = req.body;

    // Validate IDs and required fields
    if (!mongoose.Types.ObjectId.isValid(ratioId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid CoinToRupee ratio ID"
      });
    }

    if (!coins || !rupees) {
      return res.status(400).json({
        success: false,
        message: "coins and rupees are required"
      });
    }

    // Find the existing CoinToRupee record
    const existingRatio = await CoinToRupee.findById(ratioId);
    if (!existingRatio) {
      return res.status(404).json({
        success: false,
        message: "Coin to Rupee ratio not found"
      });
    }

    // Update the record
    existingRatio.coins = coins;
    existingRatio.rupees = rupees;

    // Save the updated record
    await existingRatio.save();

    return res.status(200).json({
      success: true,
      message: "Coin to Rupee ratio updated successfully",
      updatedRatio: existingRatio
    });

  } catch (error) {
    console.error("editCoinToRupee error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



export const deleteCoinToRupee = async (req, res) => {
  try {
    const { ratioId } = req.params;

    // Validate the ratio ID
    if (!mongoose.Types.ObjectId.isValid(ratioId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid CoinToRupee ratio ID"
      });
    }

    // Find and delete the CoinToRupee entry
    const deletedRatio = await CoinToRupee.findByIdAndDelete(ratioId);
    if (!deletedRatio) {
      return res.status(404).json({
        success: false,
        message: "Coin to Rupee ratio not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coin to Rupee ratio deleted successfully",
      deletedRatio
    });

  } catch (error) {
    console.error("deleteCoinToRupee error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get the Coin to Rupee ratio
export const getCoinToRupee = async (req, res) => {
  try {
    const ratio = await CoinToRupee.findOne().sort({ createdAt: -1 }); // Get the most recent ratio

    if (!ratio) {
      return res.status(404).json({
        success: false,
        message: "Coin to Rupee ratio not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coin to Rupee ratio fetched successfully",
      ratio
    });

  } catch (error) {
    console.error("getCoinToRupee error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// 1. Get all Coin Deduction Rules
export const getAllCoinDeductionRules = async (req, res) => {
  try {
    const rules = await CoinDeductionRule.find();
    return res.status(200).json({
      success: true,
      message: "Fetched all coin deduction rules",
      rules,
    });
  } catch (error) {
    console.error("❌ Error fetching coin deduction rules:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// 2. Create a new Coin Deduction Rule (admin functionality)
export const createCoinDeductionRule = async (req, res) => {
  try {
    const { type, duration, coins } = req.body;

    if (!type || !duration || !coins) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Check if the rule already exists
    const existingRule = await CoinDeductionRule.findOne({ type, duration });
    if (existingRule) {
      return res.status(400).json({ success: false, message: "This rule already exists" });
    }

    // Create a new rule
    const newRule = await CoinDeductionRule.create({
      type,
      duration,
      coins,
    });

    return res.status(201).json({
      success: true,
      message: "Coin Deduction Rule created successfully",
      rule: newRule,
    });
  } catch (error) {
    console.error("❌ Error creating coin deduction rule:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};



export const editCoinDeductionRule = async (req, res) => {
  try {
    const { ruleId } = req.params;
    const { type, duration, coins } = req.body;

    // Validate IDs and required fields
    if (!mongoose.Types.ObjectId.isValid(ruleId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Coin Deduction Rule ID"
      });
    }

    if (!type || !duration || !coins) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // Find the existing rule
    const existingRule = await CoinDeductionRule.findById(ruleId);
    if (!existingRule) {
      return res.status(404).json({
        success: false,
        message: "Coin Deduction Rule not found"
      });
    }

    // Update the rule
    existingRule.type = type;
    existingRule.duration = duration;
    existingRule.coins = coins;

    // Save the updated rule
    await existingRule.save();

    return res.status(200).json({
      success: true,
      message: "Coin Deduction Rule updated successfully",
      updatedRule: existingRule
    });

  } catch (error) {
    console.error("❌ Error updating coin deduction rule:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};



export const deleteCoinDeductionRule = async (req, res) => {
  try {
    const { ruleId } = req.params;

    // Validate the rule ID
    if (!mongoose.Types.ObjectId.isValid(ruleId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Coin Deduction Rule ID"
      });
    }

    // Find and delete the Coin Deduction Rule entry
    const deletedRule = await CoinDeductionRule.findByIdAndDelete(ruleId);
    if (!deletedRule) {
      return res.status(404).json({
        success: false,
        message: "Coin Deduction Rule not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coin Deduction Rule deleted successfully",
      deletedRule
    });

  } catch (error) {
    console.error("❌ Error deleting coin deduction rule:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ==================== ADMIN NOTIFICATION CONTROLLERS ====================
// ==================== GET ALL NOTIFICATIONS ====================
export const getAdminNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, isRead, priority } = req.query;

    const query = { isDeleted: false };
    if (type) query.type = type;
    if (isRead !== undefined) query.isRead = isRead === 'true';
    if (priority) query.priority = priority;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const notifications = await AdminNotification.find(query)
      .populate('relatedUser', 'name mobile profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AdminNotification.countDocuments(query);
    const unreadCount = await AdminNotification.countDocuments({ 
      isRead: false, 
      isDeleted: false 
    });

    return res.status(200).json({
      success: true,
      notifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      unreadCount
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


// ==================== GET BY ID ====================
export const getAdminNotificationById = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await AdminNotification.findOne({
      _id: notificationId,
      isDeleted: false
    }).populate('relatedUser', 'name mobile profileImage');

    if (!notification) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found' 
      });
    }

    return res.status(200).json({
      success: true,
      notification
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


// ==================== MARK AS READ ====================
export const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await AdminNotification.findOneAndUpdate(
      { _id: notificationId, isDeleted: false },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found' 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      notification
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


// ==================== MARK AS UNREAD ====================
export const markNotificationAsUnread = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await AdminNotification.findOneAndUpdate(
      { _id: notificationId, isDeleted: false },
      { isRead: false, readAt: null },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found' 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification marked as unread',
      notification
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


// ==================== DELETE BY ID (SOFT DELETE) ====================
export const deleteAdminNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await AdminNotification.findOneAndUpdate(
      { _id: notificationId, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found' 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};




// ===========================================
// CREATE WARNING CONTENT (Admin)
// ===========================================
export const createWarningContent = async (req, res) => {
  try {
    const { type, description } = req.body;

    if (!type || !description || !Array.isArray(description)) {
      return res.status(400).json({
        success: false,
        message: "Type and description array are required",
      });
    }

    const warning = await WarningContent.create({
      type,
      description,
    });

    return res.status(201).json({
      success: true,
      message: "Warning content created successfully",
      data: warning,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// ===========================================
// GET ALL WARNING CONTENT
// ===========================================
export const getAllWarningContent = async (req, res) => {
  try {
    const warnings = await WarningContent.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: warnings.length,
      data: warnings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// ===========================================
// GET SINGLE WARNING CONTENT
// ===========================================
export const getSingleWarningContent = async (req, res) => {
  try {
    const { id } = req.params;

    const warning = await WarningContent.findById(id);

    if (!warning) {
      return res.status(404).json({
        success: false,
        message: "Warning content not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: warning,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// ===========================================
// UPDATE WARNING CONTENT
// ===========================================
export const updateWarningContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, description } = req.body;

    const warning = await WarningContent.findById(id);

    if (!warning) {
      return res.status(404).json({
        success: false,
        message: "Warning content not found",
      });
    }

    if (type) warning.type = type;
    if (description && Array.isArray(description)) {
      warning.description = description;
    }

    await warning.save();

    return res.status(200).json({
      success: true,
      message: "Warning content updated successfully",
      data: warning,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// ===========================================
// DELETE WARNING CONTENT
// ===========================================
export const deleteWarningContent = async (req, res) => {
  try {
    const { id } = req.params;

    const warning = await WarningContent.findByIdAndDelete(id);

    if (!warning) {
      return res.status(404).json({
        success: false,
        message: "Warning content not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Warning content deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};



// ============================================================
// DASHBOARD STATS
// ============================================================

export const getAdminDashboard = async (req, res) => {
 try {
    // ==================== USER STATISTICS ====================
    const totalUsers = await User.countDocuments();
    const maleUsers = await User.countDocuments({ gender: "male" });
    const femaleUsers = await User.countDocuments({ gender: "female" });
    const otherGenderUsers = await User.countDocuments({ 
      gender: { $nin: ["male", "female"] } 
    });
    
    const activeUsers = await User.countDocuments({ 
      isOnline: true,
      isPermanentlyBlocked: false,
      isTemporarilyBlocked: false
    });
    
    const blockedUsers = await User.countDocuments({
      $or: [
        { isPermanentlyBlocked: true },
        { isTemporarilyBlocked: true }
      ]
    });
    
    const usersWithCompletedProfile = await User.countDocuments({ 
      hasCompletedProfile: true 
    });
    
    const usersWithLocation = await User.countDocuments({ 
      "location.coordinates": { $exists: true, $ne: null } 
    });

    // Recent users (last 24 hours)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const newUsersToday = await User.countDocuments({ 
      createdAt: { $gte: last24Hours } 
    });

    // ==================== CALL STATISTICS ====================
    const totalCalls = await Calling.countDocuments();
    const activeCalls = await Calling.countDocuments({ status: "ACTIVE" });
    const ringingCalls = await Calling.countDocuments({ status: "RINGING" });
    const endedCalls = await Calling.countDocuments({ status: "ENDED" });
    const missedCalls = await Calling.countDocuments({ status: "MISSED" });
    
    const maleToFemaleCalls = await Calling.countDocuments({ 
      isReceiverFemale: true 
    });
    const maleToMaleCalls = await Calling.countDocuments({ 
      isReceiverFemale: false 
    });
    
    // Call duration stats
    const callStats = await Calling.aggregate([
      {
        $match: { status: "ENDED", duration: { $exists: true, $ne: null } }
      },
      {
        $group: {
          _id: null,
          totalDuration: { $sum: "$duration" },
          avgDuration: { $avg: "$duration" },
          maxDuration: { $max: "$duration" },
          minDuration: { $min: "$duration" }
        }
      }
    ]);

    // ==================== COIN STATISTICS ====================
    const coinStats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalCoinsInSystem: { $sum: "$totalCoins" },
          avgCoinsPerUser: { $avg: "$totalCoins" },
          maxCoins: { $max: "$totalCoins" },
          minCoins: { $min: "$totalCoins" }
        }
      }
    ]);

    // Female referred rewards total
    const femaleReferredRewards = await User.aggregate([
      {
        $match: { gender: "female" }
      },
      {
        $group: {
          _id: null,
          totalReferredRewards: { $sum: "$myreferredrewarded" }
        }
      }
    ]);

    // ==================== ADMIN WALLET ====================
    const adminWallet = await Admin.findOne({});
    const adminBalance = adminWallet ? adminWallet.wallet : 0;

    // ==================== REDEEM REQUESTS ====================
    const totalRedeemRequests = await Redeem.countDocuments();
    const pendingRedeemRequests = await Redeem.countDocuments({ status: "process" });
    const completedRedeemRequests = await Redeem.countDocuments({ status: "completed" });
    const rejectedRedeemRequests = await Redeem.countDocuments({ status: "rejected" });
    
    const totalRedeemAmount = await Redeem.aggregate([
      {
        $match: { status: "completed" }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          totalCoinsRedeemed: { $sum: "$coins" }
        }
      }
    ]);

    // ==================== PAYMENT STATISTICS ====================
    const totalPayments = await CoinPayment.countDocuments();
    const completedPayments = await CoinPayment.countDocuments({ status: "completed" });
    const failedPayments = await CoinPayment.countDocuments({ status: "failed" });
    
    const paymentRevenue = await CoinPayment.aggregate([
      {
        $match: { status: "completed" }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalCoinsSold: { $sum: "$coins" }
        }
      }
    ]);

    // ==================== ROOM STATISTICS ====================
    const totalRooms = await Room.countDocuments();
    const activeRooms = await Room.countDocuments({ 
      startDateTime: { $gte: new Date().toISOString() } 
    });
    
    const roomsByType = await Room.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 }
        }
      }
    ]);

    // ==================== REPORT & WARNING STATISTICS ====================
    const totalReports = await Moderation.countDocuments();
    const pendingReports = await Moderation.countDocuments({ status: "pending" });
    const approvedReports = await Moderation.countDocuments({ status: "approved" });
    const rejectedReports = await Moderation.countDocuments({ status: "rejected" });
    const warningsIssued = await Moderation.countDocuments({ isWarning: true });
    
    const usersWithWarnings = await User.countDocuments({ 
      warningsCount: { $gt: 0 } 
    });

    // ==================== COMMUNICATION STATISTICS ====================
    const totalChatRequests = await CommunicationRequest.countDocuments();
    const pendingChatRequests = await CommunicationRequest.countDocuments({ 
      status: "pending", 
      type: "chat" 
    });
    const approvedChatRequests = await CommunicationRequest.countDocuments({ 
      status: "approved", 
      type: "chat" 
    });
    const rejectedChatRequests = await CommunicationRequest.countDocuments({ 
      status: "rejected", 
      type: "chat" 
    });
    const blockedCommunications = await CommunicationRequest.countDocuments({ 
      isBlocked: true 
    });

    // ==================== MESSAGE STATISTICS ====================
    const totalMessages = await Message.countDocuments();
    const unreadMessages = await Message.countDocuments({ status: "pending" });
    const deliveredMessages = await Message.countDocuments({ status: "delivered" });
    const readMessages = await Message.countDocuments({ status: "read" });

    // ==================== FEEDBACK STATISTICS ====================
    const totalFeedbacks = await AppFeedback.countDocuments();
    const averageRating = await AppFeedback.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" }
        }
      }
    ]);
    
    const ratingDistribution = await AppFeedback.aggregate([
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // ==================== RECENT ACTIVITY ====================
    // Recent users (last 10)
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select("name mobile gender profileImage createdAt hasCompletedProfile");

    // Recent calls (last 10)
    const recentCalls = await Calling.find()
      .populate("senderId", "name mobile profileImage")
      .populate("receiverId", "name mobile profileImage")
      .sort({ createdAt: -1 })
      .limit(10);

    // Recent payments (last 10)
    const recentPayments = await CoinPayment.find({ status: "completed" })
      .populate("userId", "name mobile profileImage")
      .populate("packageId", "coins price")
      .sort({ createdAt: -1 })
      .limit(10);

    // Recent redeem requests (last 10)
    const recentRedeems = await Redeem.find()
      .populate("userId", "name mobile profileImage gender")
      .sort({ createdAt: -1 })
      .limit(10);

    // Recent reports (last 10)
    const recentReports = await Moderation.find()
      .populate("reportedBy", "name mobile")
      .populate("reportedUser", "name mobile")
      .sort({ createdAt: -1 })
      .limit(10);

    // ==================== SETTINGS ====================
    const adminSettings = await AdminSettings.findOne();
    const coinToRupee = await CoinToRupee.findOne().sort({ createdAt: -1 });
    const coinPackages = await CoinPackage.find({ isActive: true });
    const coinDeductionRules = await CoinDeductionRule.find();
    const warningContents = await WarningContent.find();

    // ==================== CHARTS DATA ====================
    // User growth (last 7 days)
    const userGrowth = await getDailyStats(User, 7);
    
    // Call volume (last 7 days)
    const callVolume = await getDailyStats(Calling, 7);
    
    // Revenue (last 7 days)
    const revenueData = await getDailyRevenue(7);

    // ==================== COMPLETE DASHBOARD RESPONSE ====================
    return res.status(200).json({
      success: true,
      message: "Admin dashboard data fetched successfully",
      data: {
        // Summary Cards
        summary: {
          users: {
            total: totalUsers,
            male: maleUsers,
            female: femaleUsers,
            other: otherGenderUsers,
            active: activeUsers,
            blocked: blockedUsers,
            newToday: newUsersToday,
            profileCompleted: usersWithCompletedProfile,
            withLocation: usersWithLocation
          },
          calls: {
            total: totalCalls,
            active: activeCalls,
            ringing: ringingCalls,
            ended: endedCalls,
            missed: missedCalls,
            maleToFemale: maleToFemaleCalls,
            maleToMale: maleToMaleCalls,
            totalDuration: callStats[0]?.totalDuration || 0,
            avgDuration: Math.round(callStats[0]?.avgDuration || 0)
          },
          coins: {
            totalInSystem: coinStats[0]?.totalCoinsInSystem || 0,
            avgPerUser: Math.round(coinStats[0]?.avgCoinsPerUser || 0),
            femaleReferredRewards: femaleReferredRewards[0]?.totalReferredRewards || 0,
            adminBalance: adminBalance
          },
          redeem: {
            total: totalRedeemRequests,
            pending: pendingRedeemRequests,
            completed: completedRedeemRequests,
            rejected: rejectedRedeemRequests,
            totalAmount: totalRedeemAmount[0]?.totalAmount || 0,
            totalCoinsRedeemed: totalRedeemAmount[0]?.totalCoinsRedeemed || 0
          },
          payments: {
            total: totalPayments,
            completed: completedPayments,
            failed: failedPayments,
            totalRevenue: paymentRevenue[0]?.totalRevenue || 0,
            totalCoinsSold: paymentRevenue[0]?.totalCoinsSold || 0
          },
          rooms: {
            total: totalRooms,
            active: activeRooms,
            byType: roomsByType
          },
          moderation: {
            totalReports: totalReports,
            pendingReports: pendingReports,
            approvedReports: approvedReports,
            rejectedReports: rejectedReports,
            warningsIssued: warningsIssued,
            usersWithWarnings: usersWithWarnings
          },
          communication: {
            totalChatRequests: totalChatRequests,
            pending: pendingChatRequests,
            approved: approvedChatRequests,
            rejected: rejectedChatRequests,
            blocked: blockedCommunications
          },
          messages: {
            total: totalMessages,
            unread: unreadMessages,
            delivered: deliveredMessages,
            read: readMessages
          },
          feedback: {
            total: totalFeedbacks,
            averageRating: averageRating[0]?.avgRating?.toFixed(1) || 0,
            ratingDistribution: ratingDistribution
          }
        },

        // Recent Activity
        recentActivity: {
          users: recentUsers,
          calls: recentCalls,
          payments: recentPayments,
          redeems: recentRedeems,
          reports: recentReports
        },

        // Charts Data
        charts: {
          userGrowth,
          callVolume,
          revenue: revenueData
        },

        // Settings & Configurations
        settings: {
          admin: adminSettings || {},
          coinToRupee: coinToRupee || { coins: 1, rupees: 1 },
          coinPackages,
          coinDeductionRules,
          warningContents
        },

        // Timestamp
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error("❌ Admin Dashboard Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching admin dashboard data",
      error: error.message
    });
  }
};

// ==================== HELPER FUNCTIONS ====================

// Get daily stats for last N days
async function getDailyStats(model, days) {
  const result = [];
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const count = await model.countDocuments({
      createdAt: { $gte: date, $lt: nextDate }
    });
    
    result.push({
      date: date.toISOString().split('T')[0],
      count
    });
  }
  
  return result;
}

// Get daily revenue for last N days
async function getDailyRevenue(days) {
  const result = [];
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const revenue = await CoinPayment.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: date, $lt: nextDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          coins: { $sum: "$coins" }
        }
      }
    ]);
    
    result.push({
      date: date.toISOString().split('T')[0],
      revenue: revenue[0]?.total || 0,
      coins: revenue[0]?.coins || 0
    });
  }
  
  return result;
}


