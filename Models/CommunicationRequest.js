import mongoose from "mongoose";

const communicationRequestSchema = new mongoose.Schema({
  fromUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    required: true
  },
  toUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    required: true
  },
  type: {
    type: String,
    enum: ["chat", "call", "video"],
    default: "chat"
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  isBlocked: { 
    type: Boolean, 
    default: false 
  }
}, { timestamps: true });

// Add compound index to prevent duplicate requests
communicationRequestSchema.index({ fromUser: 1, toUser: 1, type: 1 }, { unique: true });

export default mongoose.model(
  "CommunicationRequest",
  communicationRequestSchema
);