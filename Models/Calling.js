import mongoose from "mongoose";

const callingSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    callerId: {
      type: String, // Could be Zego Room ID
      required: true,
    },
    callType: {
      type: String,
      enum: ["audio", "video"],
      required: true,
    },
    callerName: {
      type: String,
      default: "",
    },
    fcmToken: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["initiated", "ringing", "active", "accepted", "rejected", "ended", "missed"],
      default: "initiated",
    },
    type: {
      type: String,
      enum: ["incoming_call", "call_accepted", "call_rejected", "call_ended", "call_missed"],
      default: "incoming_call",
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 0, // seconds
    },
    coinsDeducted: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const Calling = mongoose.model("Calling", callingSchema);
export default Calling;
