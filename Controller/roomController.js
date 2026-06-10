import Room from "../Models/RoomModel.js";
import Moderation from "../Models/Warnig.js";
import User from "../Models/User.js";
import AdminSettings from "../Models/AdminSettings.js";
import CoinDeductionRule from "../Models/CoinDeductionRule.js";
import sendSimplePush from "../utils/sendSimplePush.js";
// Add at top
import createAdminNotification from "../utils/AdminNotificationService.js";
// CREATE ROOM
// ----------------------------------------------------


// 3. Get Coin Deduction Rule for a specific type and duration
export const getCoinDeductionRuleForRoom = async (type, duration) => {
  try {
    const rule = await CoinDeductionRule.findOne({ type, duration });

    if (!rule) {
      throw new Error(`No coin deduction rule found for ${type} room with ${duration} minutes`);
    }

    return rule.coins;
  } catch (error) {
    throw new Error(`Error fetching rule: ${error.message}`);
  }
};

export const createRoom = async (req, res) => {
  try {
    const { userId, adminId, type, tag, startDateTime, duration } = req.body;

    // Check if the user exists
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Deduct coins if the user is creating the room (not admin)
    if (userId !== adminId) {  // Only deduct if user is creating the room
      let coinsToDeduct = 0;

      // Fetch the coin deduction rule based on room type and duration
      try {
        coinsToDeduct = await getCoinDeductionRuleForRoom(type, duration);
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }

      if (coinsToDeduct > 0) {
        // Check if the user has enough coins
        if (userExists.totalCoins < coinsToDeduct) {
          return res.status(400).json({ success: false, message: `Insufficient coins. You have only ${userExists.totalCoins} coins` });
        }

        // Deduct coins from the user's totalCoins
        userExists.totalCoins -= coinsToDeduct;

        // Create a transaction entry
        const transactionEntry = {
          type: 'debited',
          coins: coinsToDeduct,
          amount: coinsToDeduct, // Assuming 1 coin = 1 unit currency, adjust accordingly
        };

        // Push the transaction to the user's history
        userExists.transactionhistyry.push(transactionEntry);

        // Save the updated user data
        await userExists.save();

        console.log(`✅ Deducted ${coinsToDeduct} coins from User ${userId} for creating ${type} room with duration ${duration} minutes`);
      }
    }

    // Create the room
    const room = await Room.create({
      userId,        // room creator (User)
      adminId,       // room admin (Admin)
      type,
      tag,
      startDateTime, // STRING
      duration,      // minutes
    });

    console.log("✅ Room created:", {
      roomId: room._id,
      userId,
      adminId,
      startDateTime,
      duration,
    });


    // ✅ ADMIN NOTIFICATION: New room created
    await createAdminNotification({
      title: "🎥 New Room Created",
      body: `${userExists.name || userExists.mobile} created a ${type} room`,
      type: 'room_created',
      relatedUser: userId,
      relatedData: {
        roomId: room._id,
        roomType: type,
        tag,
        duration,
        startDateTime,
        coinsDeducted: userId !== adminId ? coinsToDeduct : 0
      },
      priority: 'medium'
    });

    // Add a notification for the user who created the room
    const roomCreatedNotification = {
      title: "Room Created Successfully 🎉",
      body: `Your ${type} room has been created successfully! It will start at ${startDateTime}.`,
      type: "room_created",
      createdAt: new Date(),
    };

    // Push notification to the user's notifications array
    await User.updateOne({ _id: userId }, { $push: { notifications: roomCreatedNotification } });

    // Send push notifications to all users (or based on criteria)
    const users = await User.find();  // Fetch all users (you can modify this query as needed)

    for (const user of users) {
      if (user.fcmToken) {  // Ensure the user has a valid FCM token
        try {
          // Send a push notification to the user
          await sendSimplePush({
            fcmToken: user.fcmToken,
            title: "New Room Created!",
            body: `A new room of type ${type} has been created. Join now!`,
            data: {
              roomId: room._id,
              roomType: type,
              startDateTime,
              duration,
            },
          });
        } catch (error) {
          console.error(`❌ Failed to send push notification to user: ${user._id}, Error: ${error.message || error}`);
        }
      } else {
        console.log(`No FCM Token for user: ${user._id}`);
      }
    }

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



export const autoDeleteRoom = (room) => {
  try {
    const { _id, startDateTime, duration } = room;

    if (!startDateTime || !duration) return;

    // "09-02-2026 06:25 PM"
    const [datePart, timePart, meridian] = startDateTime.split(" ");
    const [day, month, year] = datePart.split("-").map(Number);
    let [hours, minutes] = timePart.split(":").map(Number);

    // 12h → 24h
    if (meridian === "PM" && hours !== 12) hours += 12;
    if (meridian === "AM" && hours === 12) hours = 0;

    const startTime = new Date(year, month - 1, day, hours, minutes);

    // duration + 5 minutes
    const deleteAt = new Date(
      startTime.getTime() + (duration + 5) * 60 * 1000
    );

    const delay = deleteAt.getTime() - Date.now();

    if (delay <= 0) {
      Room.findByIdAndDelete(_id)
        .then(() => console.log(`🗑️ Room deleted (expired): ${_id}`))
        .catch(err => console.error("❌ Delete error:", err));
      return;
    }

    console.log(`⏰ Room ${_id} scheduled for delete at ${deleteAt}`);

    setTimeout(async () => {
      try {
        await Room.findByIdAndDelete(_id);
        console.log(`🗑️ Room auto-deleted: ${_id}`);
      } catch (err) {
        console.error("❌ Auto delete failed:", err);
      }
    }, delay);

  } catch (err) {
    console.error("❌ autoDeleteRoom error:", err);
  }
};
// ----------------------------------------------------
// GET ALL ROOMS
// ----------------------------------------------------
export const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find().populate("userId");

    // 🔥 Background auto-delete logic (NO response change)
    rooms.forEach(room => {
      autoDeleteRoom(room);
    });

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

        // Get user details for notification
    const [reporter, reported] = await Promise.all([
      User.findById(reportedBy),
      User.findById(reportedUser)
    ]);

  // ✅ ADMIN NOTIFICATION: New user report
    await createAdminNotification({
      title: "🚨 New User Report",
      body: `${reporter?.name || reporter?.mobile} reported ${reported?.name || reported?.mobile}`,
      type: 'user_reported',
      relatedUser: reportedUser,
      relatedData: {
        reportId: report._id,
        reportedBy: {
          id: reportedBy,
          name: reporter?.name,
          mobile: reporter?.mobile
        },
        reportedUser: {
          id: reportedUser,
          name: reported?.name,
          mobile: reported?.mobile
        },
        reason,
        createdAt: report.createdAt
      },
      priority: 'high'
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



export const joinRoom = async (req, res) => {
  try {
    const { roomId, users } = req.body;

    // Find the room by roomId
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    // Loop through each user who wants to join and deduct coins
    for (const userId of users) {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: `User ${userId} not found` });
      }

      // Fetch coin deduction rule based on room type and duration
      let coinsToDeduct = 0;
      try {
        coinsToDeduct = await getCoinDeductionRuleForRoom(room.type, room.duration);
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }

      // Check if the user has enough coins
      if (user.totalCoins < coinsToDeduct) {
        return res.status(400).json({ success: false, message: `User ${userId} has insufficient coins` });
      }

      // Deduct coins from the user's totalCoins
      user.totalCoins -= coinsToDeduct;

      // Create a transaction entry for the user
      const transactionEntry = {
        type: 'debited',
        coins: coinsToDeduct,
        amount: coinsToDeduct,
      };

      // Push the transaction to the user's transaction history
      user.transactionhistyry.push(transactionEntry);

      // Save the updated user data
      await user.save();

      console.log(`✅ Deducted ${coinsToDeduct} coins from User ${userId} for joining room ${roomId}`);

      // Add user details to the room's joinedUsers array
      room.joinedUsers.push({
        userId,
        name: user.name,
        nickname: user.nickname,
        gender: user.gender,
        mobile: user.mobile,
      });

      // Send a push notification to the user who joined the room
      if (user.fcmToken) {
        try {
          await sendSimplePush({
            fcmToken: user.fcmToken,
            title: 'Joined Room Successfully!',
            body: `You have successfully joined the room of type ${room.type}. Enjoy!`,
            data: {
              roomId: room._id,
              roomType: room.type,
              startDateTime: room.startDateTime,
              duration: room.duration,
            },
          });
        } catch (error) {
          console.error(`❌ Failed to send push notification to user: ${user._id}, Error: ${error.message || error}`);
        }
      }
    }

    // Save the updated room data
    await room.save();

    return res.status(200).json({
      success: true,
      message: 'Users successfully joined the room and coins deducted',
      room,
    });
  } catch (error) {
    console.error('❌ joinRoom error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
};



// Delete Notification Controller
// Delete Notification Controller
// Delete Notifications Controller (multiple)
export const deleteNotifications = async (req, res) => {
  try {
    const { userId } = req.params;  // userId should be passed in the URL params
    const { notificationIds } = req.body;  // Array of notificationIds to be deleted

    if (!userId || !notificationIds || notificationIds.length === 0) {
      return res.status(400).json({ success: false, message: "userId and notificationIds are required" });
    }

    // Find the user by userId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Remove the notifications that match the provided notificationIds
    user.notifications = user.notifications.filter(
      notif => !notificationIds.includes(notif._id.toString())
    );

    // Save the updated user document
    await user.save();

    return res.status(200).json({
      success: true,
      message: `${notificationIds.length} notification(s) deleted successfully`,
    });

  } catch (error) {
    console.error("❌ deleteNotifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
