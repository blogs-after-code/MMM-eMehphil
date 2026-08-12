import axios from "axios";

// Reads from Netlify env var VITE_API_URL when deployed; falls back to
// localhost for local development so nothing breaks if it's unset.
const API_BASE = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api`;

export async function login(rollNumber, password) {
  const res = await axios.post(`${API_BASE}/auth/login`, { rollNumber, password });
  return res.data; // { token, user }
}

export async function requestOtp(rollNumber, purpose) {
  const res = await axios.post(`${API_BASE}/auth/request-otp`, { rollNumber, purpose });
  return res.data; // { message }
}

export async function verifyOtp(rollNumber, otp, purpose) {
  const res = await axios.post(`${API_BASE}/auth/verify-otp`, { rollNumber, otp, purpose });
  return res.data; // { verifiedToken }
}

export async function register(verifiedToken, displayName, password) {
  const res = await axios.post(`${API_BASE}/auth/register`, {
    verifiedToken,
    displayName,
    password,
  });
  return res.data; // { token, user }
}

export async function resetPassword(verifiedToken, newPassword) {
  const res = await axios.post(`${API_BASE}/auth/reset-password`, {
    verifiedToken,
    newPassword,
  });
  return res.data; // { message }
}

export async function submitReport(token, { reportedRollNumber, reason, roomId }) {
  const res = await axios.post(
    `${API_BASE}/reports`,
    { reportedRollNumber, reason, roomId },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}
