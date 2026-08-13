// Resend — sends over HTTPS (not SMTP), so it works on hosts like Render's
// free tier that block outbound SMTP ports. Free tier: 100 emails/day.
// Sign up at resend.com, grab an API key — no domain needed, since sending
// "from" onboarding@resend.dev works out of the box and can deliver to any
// real recipient address (unlike Mailtrap's demo domain, which only sends
// to your own account email without a verified custom domain).

export async function sendOtpEmail(toEmail, otp, purpose) {
  const subject =
    purpose === "register" ? "MMM eMehphil — Verify your account" : "MMM eMehphil — Reset your password";
  const action = purpose === "register" ? "verify your account" : "reset your password";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "MMM eMehphil <onboarding@resend.dev>",
      to: toEmail,
      subject,
      text: `Your OTP to ${action} is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}