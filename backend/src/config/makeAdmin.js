// Run with: node src/config/makeAdmin.js <rollNumber>
// Grants admin access to an already-registered user, so they can
// list reports and ban users via /api/reports (admin-only routes).

import dotenv from "dotenv";
import dns from "dns";
import mongoose from "mongoose";
import User from "../models/User.js";

dotenv.config();
dns.setServers(["8.8.8.8", "1.1.1.1"]);

async function makeAdmin() {
  const rollNumber = process.argv[2];
  if (!rollNumber) {
    console.error("Usage: node src/config/makeAdmin.js <rollNumber>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const result = await User.updateOne(
    { rollNumber: rollNumber.trim().toUpperCase() },
    { isAdmin: true }
  );

  if (result.matchedCount === 0) {
    console.error(`No user found with roll number ${rollNumber}. Register them first.`);
  } else {
    console.log(`${rollNumber} is now an admin.`);
  }

  await mongoose.disconnect();
}

makeAdmin();
