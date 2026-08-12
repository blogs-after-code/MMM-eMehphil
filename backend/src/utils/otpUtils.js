import bcrypt from "bcryptjs";

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

export async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

export async function compareOtp(otp, hash) {
  return bcrypt.compare(otp, hash);
}

export function getOtpExpiry() {
  return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
}

// Derives the official college email from a roll number, per MMMUT's format.
export function rollNumberToEmail(rollNumber) {
  return `${rollNumber}@mmmut.ac.in`;
}
