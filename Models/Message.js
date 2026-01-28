import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    
    messageType: {
      type: String,
      enum: ["text", "image", "video", "sticker"],
      default: "text"
    },
    
    text: String,
    mediaUrl: {
      type: [String],
      default: null
    },
    
    // Message status
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "read"],
      default: "pending"
    },
    
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Index for faster queries
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

export default mongoose.model("Message", messageSchema);