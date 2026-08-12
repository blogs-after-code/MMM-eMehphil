import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    rollNumber: { type: String, required: true, uppercase: true, trim: true },
    otpHash: { type: String, required: true },
    purpose: { type: String, enum: ["register", "reset"], required: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Auto-deletes expired OTP documents — keeps the collection clean without a cron job.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Otp", otpSchema);
