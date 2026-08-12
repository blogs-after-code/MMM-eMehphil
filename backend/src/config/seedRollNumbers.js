// Run with: node src/config/seedRollNumbers.js
// Populates a few test roll numbers so you can try registration locally.
// Replace this with your actual university roll number list later
// (e.g. imported from a CSV of enrolled students).

import dotenv from "dotenv";
import dns from "dns";
import mongoose from "mongoose";
import AllowedRollNumber from "../models/AllowedRollNumber.js";

dotenv.config();

// Some networks (college wifi, certain VPNs) block Node's own DNS resolver
// even though the OS resolver works fine — this forces Node to use Google DNS
// so the mongodb+srv:// lookup succeeds.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

// MMMUT roll numbers are 10-digit; official email is <rollnumber>.mmmut.ac.in
const testRollNumbers = ["2025021374", "2025071129", "2026011234", "2027061001"];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  for (const rollNumber of testRollNumbers) {
    const email = `${rollNumber}.mmmut.ac.in`;
    await AllowedRollNumber.updateOne(
      { rollNumber },
      { $setOnInsert: { rollNumber, email, isClaimed: false } },
      { upsert: true }
    );
  }

  console.log(`Seeded ${testRollNumbers.length} roll numbers`);
  await mongoose.disconnect();
}

seed();
