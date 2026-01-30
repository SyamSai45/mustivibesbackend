import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      required: true,
    },

    tag: {
      type: String,
      required: true,
    },
    startDateTime: {
  type: String,
}

  },
  { timestamps: true }
);

const Room = mongoose.model("Room", roomSchema);
export default Room;
