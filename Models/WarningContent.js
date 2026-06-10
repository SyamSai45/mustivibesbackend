import mongoose from "mongoose";

const warningContentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
    },
    description: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

const WarningContent = mongoose.model("WarningContent", warningContentSchema);

export default WarningContent;