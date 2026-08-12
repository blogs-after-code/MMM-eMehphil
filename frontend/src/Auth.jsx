import { useState } from "react";
import { login, requestOtp, verifyOtp, register, resetPassword } from "./api.js";

// Handles three flows:
// - login: straight roll number + password
// - register: roll number -> OTP sent to college email -> enter OTP -> set display name + password
// - forgot: roll number -> OTP sent to college email -> enter OTP -> set new password, then back to login
export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot"
  const [step, setStep] = useState("enterRoll"); // "enterRoll" | "enterOtp" | "enterDetails" | "enterNewPassword"

  const [rollNumber, setRollNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [verifiedToken, setVerifiedToken] = useState(null);

  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  function switchMode(newMode) {
    setMode(newMode);
    setStep("enterRoll");
    setOtp("");
    setDisplayName("");
    setPassword("");
    setVerifiedToken(null);
    setStatus(null);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("Logging in...");
    try {
      const { token } = await login(rollNumber, password);
      onAuthenticated(token, rollNumber.trim().toUpperCase());
    } catch (err) {
      setStatus(`Login failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestOtp(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("Sending OTP to your college email...");
    try {
      const purpose = mode === "register" ? "register" : "reset";
      await requestOtp(rollNumber, purpose);
      setStatus("OTP sent — check your college email (may take a minute).");
      setStep("enterOtp");
    } catch (err) {
      setStatus(`Failed to send OTP: ${err.response?.data?.error || err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("Verifying OTP...");
    try {
      const purpose = mode === "register" ? "register" : "reset";
      const { verifiedToken: token } = await verifyOtp(rollNumber, otp, purpose);
      setVerifiedToken(token);
      setStatus(null);
      setStep(mode === "register" ? "enterDetails" : "enterNewPassword");
    } catch (err) {
      setStatus(`Verification failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteRegister(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("Creating your account...");
    try {
      const { token } = await register(verifiedToken, displayName, password);
      onAuthenticated(token, rollNumber.trim().toUpperCase());
    } catch (err) {
      setStatus(`Registration failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteReset(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("Resetting password...");
    try {
      await resetPassword(verifiedToken, password);
      setStatus("Password reset — you can log in now.");
      switchMode("login");
    } catch (err) {
      setStatus(`Reset failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <label>
          <input type="radio" checked={mode === "login"} onChange={() => switchMode("login")} />{" "}
          Login
        </label>{" "}
        <label>
          <input
            type="radio"
            checked={mode === "register"}
            onChange={() => switchMode("register")}
          />{" "}
          Register
        </label>{" "}
        <label>
          <input type="radio" checked={mode === "forgot"} onChange={() => switchMode("forgot")} />{" "}
          Forgot password
        </label>
      </div>

      {mode === "login" && (
        <form onSubmit={handleLogin}>
          <div>
            <label>Roll number</label>
            <br />
            <input value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
          </div>
          <div style={{ marginTop: 8 }}>
            <label>Password</label>
            <br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={busy} style={{ marginTop: 12 }}>
            Login
          </button>
        </form>
      )}

      {mode !== "login" && step === "enterRoll" && (
        <form onSubmit={handleRequestOtp}>
          <div>
            <label>Roll number</label>
            <br />
            <input value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
          </div>
          <p style={{ fontSize: 12, color: "#666" }}>
            An OTP will be sent to {rollNumber || "<rollNumber>"}@mmmut.ac.in
          </p>
          <button type="submit" disabled={busy} style={{ marginTop: 4 }}>
            Send OTP
          </button>
        </form>
      )}

      {mode !== "login" && step === "enterOtp" && (
        <form onSubmit={handleVerifyOtp}>
          <div>
            <label>Enter the 6-digit OTP</label>
            <br />
            <input value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} />
          </div>
          <button type="submit" disabled={busy} style={{ marginTop: 8 }}>
            Verify OTP
          </button>
        </form>
      )}

      {mode === "register" && step === "enterDetails" && (
        <form onSubmit={handleCompleteRegister}>
          <div>
            <label>Display name</label>
            <br />
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div style={{ marginTop: 8 }}>
            <label>Set a password</label>
            <br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={busy} style={{ marginTop: 8 }}>
            Create account
          </button>
        </form>
      )}

      {mode === "forgot" && step === "enterNewPassword" && (
        <form onSubmit={handleCompleteReset}>
          <div>
            <label>New password</label>
            <br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={busy} style={{ marginTop: 8 }}>
            Reset password
          </button>
        </form>
      )}

      {status && <p style={{ marginTop: 12 }}>{status}</p>}
    </div>
  );
}
