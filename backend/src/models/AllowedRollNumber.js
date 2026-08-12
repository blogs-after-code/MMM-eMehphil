import mongoose from "mongoose";

// Pre-loaded list of valid roll numbers for your university.
// A user can only register if their roll number exists here and isn't already claimed.
const allowedRollNumberSchema = new mongoose.Schema({
  rollNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: [/^\d{10}$/, "Roll number must be 10 digits"],
  },
  // Official college email, e.g. "2025071129" for 2025071129@mmmut.ac.in
  // Kept so a future OTP-verification step can email this address before claiming.
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  isClaimed: { type: Boolean, default: false },
});

export default mongoose.model("AllowedRollNumber", allowedRollNumberSchema);
