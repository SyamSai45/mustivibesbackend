import Room from "../Models/RoomModel.js";
import Moderation from "../Models/Warnig.js";
import User from "../Models/User.js";

// ----------------------------------------------------
// CREATE ROOM
// ----------------------------------------------------
export const createRoom = async (req, res) => {
  try {
    const { userId, type, tag } = req.body;

    if (!userId || !type || !tag) {
      return res.status(400).json({
        success: false,
        message: "userId, type & tag required",
      });
    }

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const room = await Room.create({ userId, type, tag });

    return res.status(201).json({
      success: true,
      message: "Room created successfully",
      room,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ----------------------------------------------------
// GET ALL ROOMS
// ----------------------------------------------------
export const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find().populate("userId");

    return res.status(200).json({
      success: true,
      count: rooms.length,
      rooms,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ----------------------------------------------------
// GET ROOM BY ID
// ----------------------------------------------------
export const getRoomById = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findById(roomId).populate("userId");

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    return res.status(200).json({
      success: true,
      room,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ----------------------------------------------------
// UPDATE ROOM
// ----------------------------------------------------
export const updateRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { type, tag } = req.body;

    const room = await Room.findByIdAndUpdate(
      roomId,
      { type, tag },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Room updated successfully",
      room,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ----------------------------------------------------
// DELETE ROOM
// ----------------------------------------------------
export const deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findByIdAndDelete(roomId);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Room deleted successfully",
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


// ----------------------------------------------------
// GET NEARBY USERS BASED ON USER'S OWN LOCATION
// ----------------------------------------------------
// export const getNearbyUsersByUserId = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "userId required"
//       });
//     }

//     // 1. Find the requesting user's location
//     const user = await User.findById(userId);

//     if (!user || !user.location || !user.location.coordinates) {
//       return res.status(404).json({
//         success: false,
//         message: "User location not found"
//       });
//     }

//     const [longitude, latitude] = user.location.coordinates;

//     const maxDistance = 5000; // default 5 km

//     // 2. Get nearby users except the same user
//     const nearbyUsers = await User.find({
//       _id: { $ne: userId },
//       location: {
//         $near: {
//           $geometry: {
//             type: "Point",
//             coordinates: [longitude, latitude]
//           },
//           $maxDistance: maxDistance
//         }
//       }
//     });

//     return res.status(200).json({
//       success: true,
//       baseUserLocation: { latitude, longitude },
//       count: nearbyUsers.length,
//       users: nearbyUsers
//     });

//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: error.message
//     });
//   }
// };

export const getNearbyUsersByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId required"
      });
    }

    // 1. Find the requesting user (kept as-is)
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 2. Get ALL users except the same user (no nearby logic)
    const users = await User.find({
      _id: { $ne: userId }
    });

    return res.status(200).json({
      success: true,
      count: users.length,
      users
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};


export const createReport  = async (req, res) => {
  try {
    const { reportedBy, reportedUser, reason } = req.body;

    if (!reportedBy || !reportedUser || !reason) {
      return res.status(400).json({
        success: false,
        message: "reportedBy, reportedUser, and reason are required",
      });
    }

    const report = await Moderation.create({
      reportedBy,
      reportedUser,
      reason,
    });

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully. Admin will review.",
      report,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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
    if (!report)
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });

    const user = await User.findById(report.reportedUser);

    // ❌ If already permanently blocked → cannot add more warnings
    if (user.isPermanentlyBlocked) {
      return res.status(200).json({
        success: true,
        message: "User already permanently blocked. No further warnings allowed."
      });
    }

    // REJECT REPORT
    if (action === "reject") {
      report.status = "rejected";
      report.adminComment = adminComment || "Rejected by admin";

      await report.save();

      return res.status(200).json({
        success: true,
        message: "Report rejected",
        report,
      });
    }

    // APPROVE REPORT → ADD WARNING
    if (action === "approve") {
      // 🚫 Prevent warnings beyond 5
      if (user.warningsCount >= 5) {
        return res.status(400).json({
          success: false,
          message: "Maximum warning limit reached (5). User is permanently blocked.",
        });
      }

      report.status = "approved";
      report.adminComment = adminComment || "Approved by admin";
      report.isWarning = true;

      // Increase warning count
      user.warningsCount += 1;

      // TEMPORARY BLOCK FOR WARNING 3 & 4
      if (user.warningsCount === 3 || user.warningsCount === 4) {
        user.isTemporarilyBlocked = true;
        user.temporaryBlockExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
          isPermanentlyBlocked: user.isPermanentlyBlocked,
        },
        report,
      });
    }

    // INVALID ACTION
    return res.status(400).json({
      success: false,
      message: "Invalid action. Use approve/reject.",
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
