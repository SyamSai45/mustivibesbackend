// server.js

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

import connectDatabase from './db/connectDatabase.js';
import userRoutes from './Routes/UserRoutes.js';
import chatRoutes from './Routes/chatRoutes.js';
import Coins from './Routes/adminRoutes.js';
import User from './Models/User.js';
import Message from './Models/Message.js';
import cron from 'node-cron'; // Importing node-cron package
import Room from './Models/RoomModel.js';
import { parse, format } from 'date-fns'; // Import date-fns


dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use('/api/users', userRoutes);
app.use('/api', chatRoutes);
app.use('/api', Coins);

app.get('/', (req, res) => res.json({ message: 'Backend running...' }));

connectDatabase();

// ✅ Fix stale index on appfeedbacks collection (run once on startup)
import mongoose from 'mongoose';

mongoose.connection.once('open', async () => {
  const collectionsToFix = [
    { collection: 'appfeedbacks', index: 'userId_1' },
    { collection: 'adminnotifications', index: 'userId_1' },
    { collection: 'callings', index: 'userId_1' },
    { collection: 'redeem', index: 'userId_1' },
    { collection: 'coinpayments', index: 'userId_1' },
    { collection: 'communicationrequests', index: 'userId_1' },
    { collection: 'rooms', index: 'userId_1' },
    { collection: 'messages', index: 'userId_1' },
    { collection: 'users', index: 'userId_1' },
  ];

  for (const item of collectionsToFix) {
    try {
      await mongoose.connection.collection(item.collection).dropIndex(item.index);
      console.log(`✅ Dropped ${item.index} from ${item.collection}`);
    } catch (err) {
      console.log(`ℹ️ ${item.collection} - ${item.index} not found (already clean)`);
    }
  }
});
// Create HTTP server and Socket.io instance
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});
app.set('io', io);

// Export the io instance
export { io };

// Online user management
const onlineUsers = new Map();
const addUserSocket = (userId, socketId) => {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
};
const removeUserSocket = (userId, socketId) => {
  const sockets = onlineUsers.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
      return true;
    }
  }
  return false;
};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`✅ Socket connected: ${socket.id}`);

  // User comes online
  socket.on('user-online', async (userId) => {
    if (!userId) return;
    socket.userId = userId;
    addUserSocket(userId, socket.id);
    socket.join(`user:${userId}`);
    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
    io.emit('user-status-changed', { userId, isOnline: true });
    console.log(`🟢 User ${userId} online`);
  });

  // User joins chat room
  socket.on('join-chat', ({ userId, otherUserId }) => {
    if (!userId || !otherUserId) return;
    const roomId = [userId, otherUserId].sort().join('-');
    socket.join(roomId);
    console.log(`💬 User ${userId} joined room ${roomId}`);
  });

  // Sending and receiving messages
  socket.on('send-message', async ({ senderId, receiverId, message }) => {
    if (!senderId || !receiverId || !message) return;
    const roomId = [senderId, receiverId].sort().join('-');
    io.to(roomId).emit('receive-message', message);
    io.to(`user:${receiverId}`).emit('new-message', { from: senderId, message });

    // Update message status to 'delivered'
    if (onlineUsers.has(receiverId)) {
      await Message.findByIdAndUpdate(message._id, { status: 'delivered' });
    }
    console.log(`📨 Message from ${senderId} to ${receiverId} processed`);
  });

  // Message status: Delivered
  socket.on('message-delivered', async ({ messageId }) => {
    const message = await Message.findByIdAndUpdate(messageId, { status: 'delivered' }, { new: true });
    if (!message) return;
    const roomId = [message.sender.toString(), message.receiver.toString()].sort().join('-');
    io.to(roomId).emit('message-status-updated', { messageId, status: 'delivered' });
  });

  // Message status: Read
  socket.on('message-read', async ({ messageId }) => {
    const message = await Message.findByIdAndUpdate(messageId, { status: 'read' }, { new: true });
    if (!message) return;
    const roomId = [message.sender.toString(), message.receiver.toString()].sort().join('-');
    io.to(roomId).emit('message-status-updated', { messageId, status: 'read' });
  });

  // Typing indicator
  socket.on('typing', ({ senderId, receiverId }) => {
    const roomId = [senderId, receiverId].sort().join('-');
    socket.to(roomId).emit('user-typing', { userId: senderId });
  });

  // Stop typing indicator
  socket.on('stop-typing', ({ senderId, receiverId }) => {
    const roomId = [senderId, receiverId].sort().join('-');
    socket.to(roomId).emit('user-stop-typing', { userId: senderId });
  });

  // User goes offline
  socket.on('disconnect', async () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
    const userId = socket.userId;
    if (userId) {
      const fullyOffline = removeUserSocket(userId, socket.id);
      if (fullyOffline) {
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
        io.emit('user-status-changed', { userId, isOnline: false, lastSeen: new Date() });
        console.log(`🔴 User ${userId} fully offline`);
      }
    }
  });
});


// Cron Job for auto-deleting expired rooms every minute
// Cron Job for auto-deleting expired rooms every minute
cron.schedule('* * * * *', async () => {
  try {
    console.log("🕑 Running cron job to check for expired rooms...");

    const now = new Date(); // Current time

    // Find rooms where the startDateTime is in the past
    const expiredRooms = await Room.find({
      startDateTime: { $lte: now }, // Rooms that started in the past
    }).lean();

    if (expiredRooms.length > 0) {
      for (const room of expiredRooms) {
        // Parse the startDateTime properly using date-fns
        const startDateTime = parse(room.startDateTime, 'dd-MM-yyyy hh:mm a', new Date()); 

        // Calculate the actual end time of the room (startDateTime + duration + 5 mins grace)
        const roomEndTime = new Date(startDateTime);
        roomEndTime.setMinutes(roomEndTime.getMinutes() + room.duration + 5); // Adding duration and grace period
        
        // Log the room's calculated end time
        console.log(`🕒 Room ${room._id} has start time: ${format(startDateTime, 'dd-MM-yyyy hh:mm a')}`);
        console.log(`🕒 Room ${room._id} has duration: ${room.duration} minutes`);
        console.log(`🕒 Room ${room._id} will expire at: ${format(roomEndTime, 'dd-MM-yyyy hh:mm a')}`);
        
        // Check if the current time has passed the room's end time
        if (now >= roomEndTime) {
          await Room.findByIdAndDelete(room._id);
          console.log(`🗑️ Deleted expired room: ${room._id}`);
        } else {
          // Log that the room is not expired yet
          console.log(`🕒 Room ${room._id} is not expired yet. Expiry time: ${format(roomEndTime, 'dd-MM-yyyy hh:mm a')}`);
        }
      }
    } else {
      console.log("🕑 No expired rooms found.");
    }
  } catch (err) {
    console.error("❌ Error during cron job:", err);
  }
});
// Server listening on PORT
const PORT = process.env.PORT || 6060;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
