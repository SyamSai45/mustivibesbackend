import Room from "../Models/RoomModel.js";
import Moderation from "../Models/Warnig.js";
import User from "../Models/User.js";

// ----------------------------------------------------
// CREATE ROOM
// ----------------------------------------------------
export const createRoom = async (req, res) => {
  try {
    const { userId, type, tag, startDateTime } = req.body;

    if (!userId || !type || !tag || !startDateTime) {
      return res.status(400).json({
        success: false,
        message: "userId, type, tag & startDateTime required",
      });
    }

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const room = await Room.create({
      userId,
      type,
      tag,
      startDateTime, // ✅ STRING
    });

    console.log("✅ Room created:", {
      roomId: room._id,
      userId,
      startDateTime,
    });

    return res.status(201).json({
      success: true,
      message: "Room created successfully ✅",
      room,
    });

  } catch (error) {
    console.error("❌ createRoom error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const updateRoomByUser = async (req, res) => {
  try {
    const { userId, roomId } = req.params;
    const { type, tag, startDateTime } = req.body;

    // ❌ Params check
    if (!userId || !roomId) {
      return res.status(400).json({
        success: false,
        message: "userId & roomId required in params",
      });
    }

    // ❌ Full payload required
    if (!type || !tag || !startDateTime) {
      return res.status(400).json({
        success: false,
        message: "type, tag & startDateTime are required in body",
      });
    }

    // 🔍 User check
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 🔍 Room ownership check
    const room = await Room.findOne({ _id: roomId, userId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found or not authorized",
      });
    }

    // 🛠 Full update
    room.type = type;
    room.tag = tag;
    room.startDateTime = startDateTime; // STRING

    await room.save();

    console.log("✏️ Room FULLY updated ✅", {
      roomId,
      userId,
      type,
      tag,
      startDateTime,
    });

    return res.status(200).json({
      success: true,
      message: "Room updated successfully ✅",
      room,
    });

  } catch (error) {
    console.error("❌ updateRoom error:", error);
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


export const getUserReportSummary = async (req, res) => {
  try {
    const { userId } = req.params;

    // check user exists
    const user = await User.findById(userId).select(
      "name mobile warningsCount isTemporarilyBlocked isPermanentlyBlocked"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // all reports against this user
    const reports = await Moderation.find({ reportedUser: userId })
      .populate("reportedBy", "name mobile")
      .sort({ createdAt: -1 });

    // warnings only
    const warnings = reports.filter(r => r.isWarning === true);

    return res.status(200).json({
      success: true,
      user: {
        userId: user._id,
        name: user.name,
        mobile: user.mobile,
        warningsCount: user.warningsCount,
        isTemporarilyBlocked: user.isTemporarilyBlocked,
        isPermanentlyBlocked: user.isPermanentlyBlocked
      },
      totalReports: reports.length,
      totalWarnings: warnings.length,
      reports,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




// 2️⃣ Get all rooms for a specific user
export const getUserRooms = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const rooms = await Room.find({ userId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: `Found ${rooms.length} room(s) for user ✅`,
      rooms,
    });

  } catch (error) {
    console.error("❌ getUserRooms error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};



// 3️⃣ Delete a room by userId and roomId
export const deleteUserRoom = async (req, res) => {
  try {
    const { userId, roomId } = req.params;

    if (!userId || !roomId) {
      return res.status(400).json({
        success: false,
        message: "userId and roomId are required",
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if room exists and belongs to this user
    const room = await Room.findOne({ _id: roomId, userId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found or does not belong to this user",
      });
    }

    await Room.findByIdAndDelete(roomId);

    return res.status(200).json({
      success: true,
      message: "Room deleted successfully ✅",
      roomId,
      userId,
    });

  } catch (error) {
    console.error("❌ deleteRoom error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
