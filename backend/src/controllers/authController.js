import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AllowedRollNumber from "../models/AllowedRollNumber.js";

function signToken(user) {
  return jwt.sign(
    { id: user._id, rollNumber: user.rollNumber },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function register(req, res) {
  try {
    const { rollNumber, displayName, password } = req.body;

    if (!rollNumber || !displayName || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const normalizedRoll = rollNumber.trim().toUpperCase();

    const allowed = await AllowedRollNumber.findOne({ rollNumber: normalizedRoll });
    if (!allowed) {
      return res.status(403).json({ error: "This roll number is not recognized by the university list" });
    }
    if (allowed.isClaimed) {
      return res.status(409).json({ error: "This roll number has already been registered" });
    }

    const existingUser = await User.findOne({ rollNumber: normalizedRoll });
    if (existingUser) {
      return res.status(409).json({ error: "Account already exists for this roll number" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      rollNumber: normalizedRoll,
      email: allowed.email,
      displayName,
      passwordHash,
    });

    allowed.isClaimed = true;
    await allowed.save();

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user._id, rollNumber: user.rollNumber, displayName: user.displayName },
    });
  } catch (err) {
    res.status(500).json({ error: "Registration failed", details: err.message });
  }
}

export async function login(req, res) {
  try {
    const { rollNumber, password } = req.body;
    if (!rollNumber || !password) {
      return res.status(400).json({ error: "Roll number and password are required" });
    }

    const normalizedRoll = rollNumber.trim().toUpperCase();
    const user = await User.findOne({ rollNumber: normalizedRoll });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: "This account has been banned" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user._id, rollNumber: user.rollNumber, displayName: user.displayName },
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed", details: err.message });
  }
}
