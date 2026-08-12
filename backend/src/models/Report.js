import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reporterRollNumber: { type: String, required: true },
    reportedRollNumber: { type: String, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    // roomId ties the report back to the specific call, useful context when reviewing
    roomId: { type: String },
    status: {
      type: String,
      enum: ["pending", "reviewed", "banned", "dismissed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Report", reportSchema);
