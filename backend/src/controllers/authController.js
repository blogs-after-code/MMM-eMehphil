import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AllowedRollNumber from "../models/AllowedRollNumber.js";
import Otp from "../models/Otp.js";
import { sendOtpEmail } from "../utils/mailer.js";
import { generateOtp, hashOtp, compareOtp, getOtpExpiry } from "../utils/otpUtils.js";

function signToken(user) {
  return jwt.sign(
    { id: user._id, rollNumber: user.rollNumber },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Short-lived token proving a roll number just passed OTP verification.
// register/reset-password require this instead of trusting the roll number alone.
function signVerifiedToken(rollNumber, purpose) {
  return jwt.sign({ rollNumber, purpose }, process.env.JWT_SECRET, { expiresIn: "15m" });
}

// Step 1 of register/reset: send an OTP to the roll number's official college email.
export async function requestOtp(req, res) {
  try {
    const { rollNumber, purpose } = req.body; // purpose: "register" | "reset"
    if (!rollNumber || !["register", "reset"].includes(purpose)) {
      return res.status(400).json({ error: "Roll number and a valid purpose are required" });
    }

    const normalizedRoll = rollNumber.trim().toUpperCase();

    if (purpose === "register") {
      const allowed = await AllowedRollNumber.findOne({ rollNumber: normalizedRoll });
      if (!allowed) {
        return res.status(403).json({ error: "This roll number is not recognized by the university list" });
      }
      if (allowed.isClaimed) {
        return res.status(409).json({ error: "This roll number has already been registered" });
      }

      const otp = generateOtp();
      await Otp.create({
        rollNumber: normalizedRoll,
        otpHash: await hashOtp(otp),
        purpose,
        expiresAt: getOtpExpiry(),
      });
      await sendOtpEmail(allowed.email, otp, purpose);
    } else {
      // reset — must be an existing, registered user
      const user = await User.findOne({ rollNumber: normalizedRoll });
      if (!user) {
        return res.status(404).json({ error: "No account found for this roll number" });
      }

      const otp = generateOtp();
      await Otp.create({
        rollNumber: normalizedRoll,
        otpHash: await hashOtp(otp),
        purpose,
        expiresAt: getOtpExpiry(),
      });
      await sendOtpEmail(user.email, otp, purpose);
    }

    res.json({ message: "OTP sent to your college email" });
  } catch (err) {
    res.status(500).json({ error: "Failed to send OTP", details: err.message });
  }
}

// Step 2: verify the OTP, return a short-lived token that register/reset-password requires.
export async function verifyOtp(req, res) {
  try {
    const { rollNumber, otp, purpose } = req.body;
    if (!rollNumber || !otp || !purpose) {
      return res.status(400).json({ error: "Roll number, OTP, and purpose are required" });
    }

    const normalizedRoll = rollNumber.trim().toUpperCase();

    // Most recent, unused, unexpired OTP for this roll number + purpose
    const record = await Otp.findOne({
      rollNumber: normalizedRoll,
      purpose,
      used: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!record) {
      return res.status(400).json({ error: "No valid OTP found — it may have expired. Request a new one." });
    }

    const isMatch = await compareOtp(otp, record.otpHash);
    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect OTP" });
    }

    record.used = true;
    await record.save();

    const verifiedToken = signVerifiedToken(normalizedRoll, purpose);
    res.json({ verifiedToken });
  } catch (err) {
    res.status(500).json({ error: "OTP verification failed", details: err.message });
  }
}

export async function register(req, res) {
  try {
    const { verifiedToken, displayName, password } = req.body;

    if (!verifiedToken || !displayName || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(verifiedToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "OTP verification expired — please verify again" });
    }
    if (decoded.purpose !== "register") {
      return res.status(400).json({ error: "Invalid verification token for registration" });
    }

    const normalizedRoll = decoded.rollNumber;

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

// Step 3 of password reset: set a new password using the verified token from verifyOtp.
export async function resetPassword(req, res) {
  try {
    const { verifiedToken, newPassword } = req.body;
    if (!verifiedToken || !newPassword) {
      return res.status(400).json({ error: "Verification token and new password are required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(verifiedToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "OTP verification expired — please verify again" });
    }
    if (decoded.purpose !== "reset") {
      return res.status(400).json({ error: "Invalid verification token for password reset" });
    }

    const user = await User.findOne({ rollNumber: decoded.rollNumber });
    if (!user) {
      return res.status(404).json({ error: "Account not found" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ error: "Password reset failed", details: err.message });
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
