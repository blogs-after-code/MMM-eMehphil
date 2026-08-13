import nodemailer from "nodemailer";

// Gmail SMTP. Built lazily (not at module load time): ES module imports
// all resolve before server.js's dotenv.config() call actually runs, so
// creating this at the top of the file would capture EMAIL_USER/
// EMAIL_APP_PASSWORD as undefined every time, even with a correct .env.
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

export async function sendOtpEmail(toEmail, otp, purpose) {
  const subject =
    purpose === "register" ? "MMM eMehphil — Verify your account" : "MMM eMehphil — Reset your password";
  const action = purpose === "register" ? "verify your account" : "reset your password";

  await getTransporter().sendMail({
    from: `"MMM eMehphil" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    text: `Your OTP to ${action} is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`,
  });
}
