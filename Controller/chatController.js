import cloudinary from "../config/cloudinary.js";
import Message from "../Models/Message.js";
import CommunicationRequest from "../Models/CommunicationRequest.js";
import User from "../Models/User.js";
import fs from "fs";

/* ================================
   HELPER FUNCTION: Get Relationship Status
================================ */
const getRelationshipStatus = async (userId, otherUserId) => {
  const user = await User.findById(userId).select("followers following");
  const otherUser = await User.findById(otherUserId).select("followers following");

  if (!user || !otherUser) {
    return {
      isFollowing: false,
      isFollower: false,
      isMutual: false,
      theyFollowYou: false,
      youFollowThem: false
    };
  }

  const isFollowing = user.following?.some(id => id.toString() === otherUserId) || false;
  const isFollower = user.followers?.some(id => id.toString() === otherUserId) || false;
  const otherIsFollowing = otherUser.following?.some(id => id.toString() === userId) || false;

  return {
    isFollowing,
    isFollower,
    isMutual: isFollowing && isFollower,
    theyFollowYou: otherIsFollowing,
    youFollowThem: isFollowing
  };
};

/* ================================
   SEND MESSAGE (One-on-One)
================================ */
export const sendMessage = async (req, res) => {
  try {
    const io = req.app.get("io"); // 🔥 socket access

    const { senderId, receiverId, messageType, text } = req.body;

    if (!senderId || !receiverId || !messageType) {
      return res.status(400).json({
        success: false,
        message: "senderId, receiverId, messageType are required",
      });
    }

    if (senderId === receiverId) {
      return res.status(400).json({
        success: false,
        message: "Cannot send message to yourself",
      });
    }

    // ----------------------------
    // RELATIONSHIP STATUS
    // ----------------------------
    const relationship = await getRelationshipStatus(senderId, receiverId);

    // ----------------------------
    // CHAT PERMISSION
    // ----------------------------
    let permission = await CommunicationRequest.findOne({
      fromUser: senderId,
      toUser: receiverId,
      type: "chat",
      isBlocked: false,
    });

    let messageStatus = "pending";

    if (!permission) {
      try {
        permission = await CommunicationRequest.create({
          fromUser: senderId,
          toUser: receiverId,
          type: "chat",
          status: "pending",
        });
      } catch (err) {
        if (err.code === 11000) {
          permission = await CommunicationRequest.findOne({
            fromUser: senderId,
            toUser: receiverId,
            type: "chat",
          });
        } else {
          throw err;
        }
      }
    }

    if (permission.status === "approved") {
      messageStatus = "sent";
    } else if (permission.status === "rejected") {
      return res.status(403).json({
        success: false,
        message: "Chat request was rejected",
      });
    }

    // ----------------------------
    // MEDIA UPLOAD
    // ----------------------------
    let mediaUrls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        if (!["media", "mediaUrl"].includes(file.fieldname)) {
          fs.unlinkSync(file.path);
          return res.status(400).json({
            success: false,
            message: `Invalid field '${file.fieldname}'`,
          });
        }

        if (!file.mimetype.startsWith("image") && !file.mimetype.startsWith("video")) {
          fs.unlinkSync(file.path);
          return res.status(400).json({
            success: false,
            message: "Only images and videos allowed",
          });
        }

        const upload = await cloudinary.uploader.upload(file.path, {
          resource_type: file.mimetype.startsWith("video") ? "video" : "image",
          folder: "chat-media",
        });

        mediaUrls.push(upload.secure_url);
        fs.unlinkSync(file.path);
      }
    }

    // ----------------------------
    // CREATE MESSAGE
    // ----------------------------
    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      messageType,
      text: text || null,
      mediaUrl: mediaUrls.length ? mediaUrls : null,
      status: messageStatus,
    });

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name nickname profileImage isOnline lastSeen")
      .populate("receiver", "name nickname profileImage isOnline lastSeen");

    // ----------------------------
    // 🔥 SOCKET EMIT (TERMINAL LOGS)
    // ----------------------------
    const roomId = [senderId, receiverId].sort().join("-");

    io.to(roomId).emit("receive-message", populatedMessage);
    console.log(`🔥 [Socket Emit] Message sent to room ${roomId}`);

    io.to(`user:${receiverId}`).emit("new-message", {
      from: senderId,
      message: populatedMessage,
    });
    console.log(`📨 [Socket Emit] New-message notification to user:${receiverId}`);

    // ----------------------------
    // RESPONSE
    // ----------------------------
    return res.status(201).json({
      success: true,
      message: populatedMessage,
      chatStatus: messageStatus === "pending" ? "waiting_for_approval" : "approved",
      relationship: {
        isFollowing: relationship.isFollowing,
        isFollower: relationship.isFollower,
        isMutual: relationship.isMutual,
        status: relationship.isMutual
          ? "mutual"
          : relationship.isFollowing
          ? "following"
          : relationship.isFollower
          ? "follower"
          : "none",
      },
    });
  } catch (error) {
    console.error("❌ Error in sendMessage:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================================
   APPROVE CHAT REQUEST
================================ */
export const approveChatRequest = async (req, res) => {
  try {
    const { userId, requesterId } = req.body;

    if (!userId || !requesterId) {
      return res.status(400).json({
        success: false,
        message: "userId and requesterId are required"
      });
    }

    // Verify the approving user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if requester exists
    const requester = await User.findById(requesterId);
    if (!requester) {
      return res.status(404).json({
        success: false,
        message: "Requester not found"
      });
    }

    // Find the request - requester sent to userId
    let request = await CommunicationRequest.findOne({
      fromUser: requesterId,
      toUser: userId,
      type: "chat"
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Chat request not found",
        debug: {
          fromUser: requesterId,
          toUser: userId,
          hint: "Make sure the requester has sent a message first"
        }
      });
    }

    // Check if already approved
    if (request.status === "approved") {
      return res.status(200).json({
        success: true,
        message: "Chat request already approved"
      });
    }

    // Approve the request
    request.status = "approved";
    await request.save();

    // Update all pending messages to "sent"
    const updateResult = await Message.updateMany(
      {
        $or: [
          { sender: requesterId, receiver: userId },
          { sender: userId, receiver: requesterId }
        ],
        status: "pending"
      },
      { status: "sent" }
    );

    // Get relationship status
    const relationship = await getRelationshipStatus(userId, requesterId);

    return res.status(200).json({
      success: true,
      message: "Chat request approved. Messages delivered.",
      messagesUpdated: updateResult.modifiedCount,
      relationship: {
        isFollowing: relationship.isFollowing,
        isFollower: relationship.isFollower,
        isMutual: relationship.isMutual,
        status: relationship.isMutual ? "mutual" : relationship.isFollowing ? "following" : relationship.isFollower ? "follower" : "none"
      }
    });

  } catch (error) {
    console.error("Error in approveChatRequest:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* ================================
   REJECT CHAT REQUEST
================================ */
export const rejectChatRequest = async (req, res) => {
  try {
    const { userId, requesterId } = req.body;

    // 1️⃣ Validate input
    if (!userId || !requesterId) {
      return res.status(400).json({
        success: false,
        message: "userId and requesterId are required"
      });
    }

    // 2️⃣ Verify rejecting user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 3️⃣ Verify requester exists
    const requester = await User.findById(requesterId);
    if (!requester) {
      return res.status(404).json({
        success: false,
        message: "Requester not found"
      });
    }

    // 4️⃣ Find chat request
    const request = await CommunicationRequest.findOne({
      fromUser: requesterId,
      toUser: userId,
      type: "chat"
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Chat request not found",
        debug: {
          fromUser: requesterId,
          toUser: userId
        }
      });
    }

    // 5️⃣ If already rejected
    if (request.status === "rejected") {
      return res.status(200).json({
        success: true,
        message: "Chat request already rejected"
      });
    }

    // 6️⃣ Reject request
    request.status = "rejected";
    await request.save();

    // 7️⃣ (OPTIONAL but LOGICALLY CONSISTENT)
    // Keep pending messages as pending (DO NOT deliver)
    // No updateMany here — aligns with approve logic

    // 8️⃣ Relationship status
    const relationship = await getRelationshipStatus(userId, requesterId);

    return res.status(200).json({
      success: true,
      message: "Chat request rejected",
      relationship: {
        isFollowing: relationship.isFollowing,
        isFollower: relationship.isFollower,
        isMutual: relationship.isMutual,
        status: relationship.isMutual
          ? "mutual"
          : relationship.isFollowing
          ? "following"
          : relationship.isFollower
          ? "follower"
          : "none"
      }
    });

  } catch (error) {
    console.error("Error in rejectChatRequest:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




/* ================================
   GET PENDING CHAT REQUESTS
================================ */
export const getPendingChatRequests = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1️⃣ Validate user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 2️⃣ Fetch pending chat requests
    const requests = await CommunicationRequest.find({
      toUser: userId,
      type: "chat",
      status: "pending",
      isBlocked: false
    })
      .populate("fromUser", "name nickname profileImage mobile")
      .sort({ createdAt: -1 });

    // 3️⃣ Attach relationship status (PIN-TO-PIN with approve)
    const formattedRequests = await Promise.all(
      requests.map(async (request) => {
        const relationship = await getRelationshipStatus(
          userId,
          request.fromUser._id.toString()
        );

        return {
          _id: request._id,
          fromUser: {
            _id: request.fromUser._id,
            name:
              request.fromUser.name?.trim() !== ""
                ? request.fromUser.name
                : request.fromUser.nickname || request.fromUser.mobile,
            profileImage: request.fromUser.profileImage
          },
          relationship: {
            isFollowing: relationship.isFollowing,
            isFollower: relationship.isFollower,
            isMutual: relationship.isMutual,
            status: relationship.isMutual
              ? "mutual"
              : relationship.isFollowing
              ? "following"
              : relationship.isFollower
              ? "follower"
              : "none"
          },
          createdAt: request.createdAt
        };
      })
    );

    // 4️⃣ Response
    return res.status(200).json({
      success: true,
      count: formattedRequests.length,
      requests: formattedRequests
    });

  } catch (error) {
    console.error("Error in getPendingChatRequests:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ================================
   GET CONVERSATION
================================ */
export const getConversation = async (req, res) => {
  try {
    const io = req.app.get("io"); // 🔥 socket access
    const { userId, otherUserId } = req.params;

    if (!userId || !otherUserId) {
      return res.status(400).json({ success: false, message: "userId and otherUserId are required" });
    }

    const relationship = await getRelationshipStatus(userId, otherUserId);

    const otherUser = await User.findById(otherUserId)
      .select("name nickname profileImage isOnline lastSeen mobile");

    if (!otherUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const permission = await CommunicationRequest.findOne({
      fromUser: userId,
      toUser: otherUserId,
      type: "chat",
      status: "approved",
      isBlocked: false
    });

    const reversePermission = await CommunicationRequest.findOne({
      fromUser: otherUserId,
      toUser: userId,
      type: "chat",
      status: "approved",
      isBlocked: false
    });

    const isApproved = permission || reversePermission;

    const isBlocked = await CommunicationRequest.findOne({
      $or: [
        { fromUser: userId, toUser: otherUserId, isBlocked: true },
        { fromUser: otherUserId, toUser: userId, isBlocked: true }
      ]
    });

    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: otherUserId },
        { sender: otherUserId, receiver: userId }
      ],
      deletedFor: { $ne: userId }
    })
      .populate("sender", "name nickname profileImage isOnline lastSeen")
      .populate("receiver", "name nickname profileImage isOnline lastSeen")
      .sort({ createdAt: 1 });

    const filteredMessages = isApproved ? messages : messages.filter(msg => msg.status === "pending");

    const roomId = [userId, otherUserId].sort().join("-");
    io.to(roomId).emit("conversation-fetched", { messages: filteredMessages, fetchedAt: new Date() });
    console.log(`📖 [Socket Info] Conversation fetched for room ${roomId}`);

    return res.status(200).json({
      success: true,
      isApproved: !!isApproved,
      isBlocked: !!isBlocked,
      otherUser: {
        _id: otherUser._id,
        name: otherUser.name?.trim() !== "" ? otherUser.name : (otherUser.nickname || otherUser.mobile),
        profileImage: otherUser.profileImage,
        isOnline: otherUser.isOnline,
        lastSeen: otherUser.lastSeen
      },
      relationship: {
        isFollowing: relationship.isFollowing,
        isFollower: relationship.isFollower,
        isMutual: relationship.isMutual,
        status: relationship.isMutual
          ? "mutual"
          : relationship.isFollowing
          ? "following"
          : relationship.isFollower
          ? "follower"
          : "none"
      },
      messages: filteredMessages
    });
  } catch (error) {
    console.error("Error in getConversation:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
/* ================================
   GET MY CHATS
================================ */
export const getMyChats = async (req, res) => {
  try {
    const { userId } = req.params;

    /* ---------------- VALIDATE USER ---------------- */
    const currentUser = await User.findById(userId)
      .select("followers following");

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    /* ---------------- FIND CHAT USER IDS ---------------- */
    const sentUsers = await Message.find({
      sender: userId,
      deletedFor: { $ne: userId }
    }).distinct("receiver");

    const receivedUsers = await Message.find({
      receiver: userId,
      deletedFor: { $ne: userId }
    }).distinct("sender");

    // ✅ FIX: ObjectId → string → unique
    const chatUserIds = [
      ...new Set(
        [...sentUsers, ...receivedUsers].map(id => id.toString())
      )
    ];

    if (chatUserIds.length === 0) {
      return res.status(200).json({
        success: true,
        chats: []
      });
    }

    /* ---------------- FETCH APPROVED CHAT REQUESTS ---------------- */
    const approvedRequests = await CommunicationRequest.find({
      type: "chat",
      status: "approved",
      isBlocked: false,
      $or: [
        { fromUser: userId },
        { toUser: userId }
      ]
    }).select("fromUser toUser");

    // ✅ Fast lookup map
    const approvedChatMap = new Set(
      approvedRequests.map(req => {
        const from = req.fromUser.toString();
        const to = req.toUser.toString();
        return from === userId ? to : from;
      })
    );

    /* ---------------- BUILD CHAT LIST ---------------- */
    const chats = await Promise.all(
      chatUserIds.map(async (otherUserId) => {
        const otherUser = await User.findById(otherUserId)
          .select(
            "name nickname profileImage isOnline lastSeen mobile followers following isPermanentlyBlocked isTemporarilyBlocked"
          );

        if (!otherUser) return null;

        const lastMessage = await Message.findOne({
          $or: [
            { sender: userId, receiver: otherUserId },
            { sender: otherUserId, receiver: userId }
          ],
          deletedFor: { $ne: userId }
        }).sort({ createdAt: -1 });

        const unreadCount = await Message.countDocuments({
          sender: otherUserId,
          receiver: userId,
          status: { $ne: "read" }
        });

        const isFollow = currentUser.following.includes(otherUser._id);
        const isFollowed = currentUser.followers.includes(otherUser._id);

        const isBlocked =
          otherUser.isPermanentlyBlocked || otherUser.isTemporarilyBlocked;

        const isChatApproved = approvedChatMap.has(otherUserId);

        return {
          user: {
            _id: otherUser._id,
            name: otherUser.name || otherUser.nickname || otherUser.mobile,
            profileImage: otherUser.profileImage,
            isOnline: otherUser.isOnline,
            lastSeen: otherUser.lastSeen,
            isFollow,
            isFollowed,
            isBlocked,
            isChatApproved
          },
          lastMessage,
          unreadCount,
          updatedAt: lastMessage?.createdAt || null
        };
      })
    );

    /* ---------------- SORT & RESPONSE ---------------- */
    const finalChats = chats
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return res.status(200).json({
      success: true,
      chats: finalChats
    });

  } catch (error) {
    console.error("❌ getMyChats error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* ================================
   EDIT MESSAGE
================================ */
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, newText } = req.body;

    const message = await Message.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ 
        success: false, 
        message: "Message not found" 
      });
    }

    if (message.sender.toString() !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: "Not authorized" 
      });
    }

    message.text = newText;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    return res.status(200).json({ 
      success: true, 
      message: "Message updated successfully",
      updatedMessage: message 
    });

  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

/* ================================
   DELETE MESSAGE
================================ */
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, deleteFor } = req.body;

    const message = await Message.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ 
        success: false, 
        message: "Message not found" 
      });
    }

    if (deleteFor === "me") {
      if (!message.deletedFor.includes(userId)) {
        message.deletedFor.push(userId);
        await message.save();
      }
      return res.json({ 
        success: true, 
        message: "Message deleted for you" 
      });
    }

    if (deleteFor === "both") {
      if (message.sender.toString() !== userId) {
        return res.status(403).json({ 
          success: false, 
          message: "Only sender can delete for both" 
        });
      }
      
      await Message.findByIdAndDelete(messageId);
      return res.json({ 
        success: true, 
        message: "Message deleted for both" 
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid deleteFor value. Use 'me' or 'both'"
    });

  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

/* ================================
   UPDATE MESSAGE STATUS
================================ */
export const updateMessageStatus = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { status } = req.body;

    if (!["delivered", "read"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use 'delivered' or 'read'"
      });
    }

    const message = await Message.findByIdAndUpdate(
      messageId,
      { status },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: `Message marked as ${status}`,
      updatedMessage: message
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};



export const getRandomUsers = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1️⃣ Current user
    const currentUser = await User.findById(userId)
      .select("followers following");

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 2️⃣ Already chatted users
    const sentUsers = await Message.find({
      sender: userId,
      deletedFor: { $ne: userId }
    }).distinct("receiver");

    const receivedUsers = await Message.find({
      receiver: userId,
      deletedFor: { $ne: userId }
    }).distinct("sender");

    const excludeIds = [...new Set([...sentUsers, ...receivedUsers, userId])];

    // 3️⃣ Random users
    const users = await User.find({
      _id: { $nin: excludeIds }
    })
      .select("name nickname profileImage isOnline lastActive isPermanentlyBlocked isTemporarilyBlocked")
      .limit(20);

    // 4️⃣ Add flags
    const usersWithFlags = users.map((u) => {
      const isFollow = currentUser.following.includes(u._id);
      const isFollowed = currentUser.followers.includes(u._id);

      return {
        ...u.toObject(),
        isFollow,
        isFollowed,
        isBlocked: u.isPermanentlyBlocked || u.isTemporarilyBlocked,
        isChatApproved: false // jab tak tum chat approval system confirm na karo
      };
    });

    // 5️⃣ Response
    return res.status(200).json({
      success: true,
      users: usersWithFlags
    });

  } catch (error) {
    console.error("getRandomUsers error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
