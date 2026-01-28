import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { Server } from "socket.io";

import connectDatabase from './db/connectDatabase.js';
import userRoutes from "./Routes/UserRoutes.js";
import chatRoutes from "./Routes/chatRoutes.js";
import Coins from "./Routes/adminRoutes.js";
import User from "./Models/User.js";
import Message from "./Models/Message.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api/users', userRoutes);
app.use('/api', chatRoutes);
app.use('/api', Coins);

app.get('/', (req, res) => res.json({ message: "Backend running..." }));

connectDatabase();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] }, pingTimeout:60000, pingInterval:25000 });
app.set('io', io);

const onlineUsers = new Map();
const addUserSocket = (userId, socketId) => { if (!onlineUsers.has(userId)) onlineUsers.set(userId,new Set()); onlineUsers.get(userId).add(socketId); };
const removeUserSocket = (userId, socketId) => { const sockets=onlineUsers.get(userId); if(sockets){ sockets.delete(socketId); if(sockets.size===0){ onlineUsers.delete(userId); return true; } } return false; };

io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.id);

  socket.on("user-online", async (userId) => {
    if(!userId) return;
    socket.userId=userId;
    addUserSocket(userId,socket.id);
    socket.join(`user:${userId}`);
    await User.findByIdAndUpdate(userId,{ isOnline:true,lastSeen:new Date() });
    io.emit("user-status-changed",{ userId,isOnline:true });
    console.log(`🟢 User ${userId} online`);
  });

  socket.on("join-chat", ({userId,otherUserId})=>{
    if(!userId||!otherUserId) return;
    const roomId=[userId,otherUserId].sort().join("-");
    socket.join(roomId);
    console.log(`💬 User ${userId} joined room ${roomId}`);
  });

  socket.on("send-message", async ({senderId,receiverId,message})=>{
    if(!senderId||!receiverId||!message) return;
    const roomId=[senderId,receiverId].sort().join("-");
    io.to(roomId).emit("receive-message",message);
    io.to(`user:${receiverId}`).emit("new-message",{ from:senderId,message });
    if(onlineUsers.has(receiverId)) await Message.findByIdAndUpdate(message._id,{ status:"delivered" });
    console.log(`📨 Message from ${senderId} to ${receiverId} processed`);
  });

  socket.on("message-delivered", async ({messageId})=>{
    const message=await Message.findByIdAndUpdate(messageId,{ status:"delivered"},{ new:true });
    if(!message) return;
    const roomId=[message.sender.toString(),message.receiver.toString()].sort().join("-");
    io.to(roomId).emit("message-status-updated",{ messageId,status:"delivered" });
  });

  socket.on("message-read", async ({messageId})=>{
    const message=await Message.findByIdAndUpdate(messageId,{ status:"read"},{ new:true });
    if(!message) return;
    const roomId=[message.sender.toString(),message.receiver.toString()].sort().join("-");
    io.to(roomId).emit("message-status-updated",{ messageId,status:"read" });
  });

  socket.on("typing", ({senderId,receiverId})=>{ const roomId=[senderId,receiverId].sort().join("-"); socket.to(roomId).emit("user-typing",{ userId:senderId }); });
  socket.on("stop-typing", ({senderId,receiverId})=>{ const roomId=[senderId,receiverId].sort().join("-"); socket.to(roomId).emit("user-stop-typing",{ userId:senderId }); });

  socket.on("disconnect", async ()=>{
    console.log("❌ Socket disconnected:", socket.id);
    const userId=socket.userId;
    if(userId){
      const fullyOffline=removeUserSocket(userId,socket.id);
      if(fullyOffline){
        await User.findByIdAndUpdate(userId,{ isOnline:false,lastSeen:new Date() });
        io.emit("user-status-changed",{ userId,isOnline:false,lastSeen:new Date() });
        console.log(`🔴 User ${userId} fully offline`);
      }
    }
  });
});

const PORT=process.env.PORT||6060;
server.listen(PORT,()=>console.log(`Server running at http://localhost:${PORT}`));
