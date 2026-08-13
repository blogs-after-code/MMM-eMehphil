// Run with: node src/config/backfillMissingEmails.js
// Users registered via Bruno before the OTP system existed have no email
// field saved — this backfills it so forgot-password works for them too.

import dotenv from "dotenv";
import dns from "dns";
import mongoose from "mongoose";
import User from "../models/User.js";

dotenv.config();
dns.setServers(["8.8.8.8", "1.1.1.1"]);

async function backfill() {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({ $or: [{ email: { $exists: false } }, { email: null }, { email: "" }] });

  for (const user of users) {
    user.email = `${user.rollNumber}@mmmut.ac.in`;
    await user.save();
    console.log(`Backfilled ${user.rollNumber}: ${user.email}`);
  }

  console.log(`Done — fixed ${users.length} user(s).`);
  await mongoose.disconnect();
}

backfill();
