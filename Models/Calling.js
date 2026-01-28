import mongoose from "mongoose";

const callingSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    callerId: {
      type: String, // Room ID or string
    },
    callType: {
      type: String,
      enum: ["audio", "video"],
    },
      // ✅ NEW FIELD
    type: {
      type: String,
      enum: [
        "incoming_call",
        "call_accepted",
        "call_rejected",
        "call_ended",
        "call_missed",
      ],
      default: "incoming_call",
    },
    fcmToken: {
      type: String,
    },
     callerName: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["initiated", "ringing", "accepted", "rejected", "ended", "missed"],
      default: "initiated",
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Calling = mongoose.model("Calling", callingSchema);
export default Calling;
