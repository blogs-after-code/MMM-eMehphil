import nodemailer from "nodemailer";

// Gmail SMTP — free, reliable enough for a college project. Requires an
// "App Password" (not your normal Gmail password) — see .env.example.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

export async function sendOtpEmail(toEmail, otp, purpose) {
  const subject =
    purpose === "register" ? "MMM eMehphil — Verify your account" : "MMM eMehphil — Reset your password";

  const action = purpose === "register" ? "verify your account" : "reset your password";

  await transporter.sendMail({
    from: `"MMM eMehphil" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    text: `Your OTP to ${action} is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`,
  });
}
