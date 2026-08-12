// Run with: node src/config/fixEmailFormat.js
// One-time fix: any User already registered before the email format was
// corrected (rollnumber.mmmut.ac.in → rollnumber@mmmut.ac.in) will have
// the broken address stored. This corrects existing records. Safe to
// run multiple times — it only touches emails still in the old format.

import dotenv from "dotenv";
import dns from "dns";
import mongoose from "mongoose";
import User from "../models/User.js";

dotenv.config();
dns.setServers(["8.8.8.8", "1.1.1.1"]);

async function fixEmails() {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({ email: { $regex: /^\d+\.mmmut\.ac\.in$/ } });

  for (const user of users) {
    const fixedEmail = user.email.replace(".mmmut.ac.in", "@mmmut.ac.in");
    user.email = fixedEmail;
    await user.save();
    console.log(`Fixed ${user.rollNumber}: ${fixedEmail}`);
  }

  console.log(`Done — fixed ${users.length} user(s).`);
  await mongoose.disconnect();
}

fixEmails();
