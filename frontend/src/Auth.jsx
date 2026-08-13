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
      const data = err.response?.data;
      const detail = data?.details ? ` (${data.details})` : "";
      setStatus(`Failed to send OTP: ${data?.error || err.message}${detail}`);
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
      <div className="mode-tabs">
        <div
          className={`mode-tab ${mode === "login" ? "active" : ""}`}
          onClick={() => switchMode("login")}
        >
          Login
        </div>
        <div
          className={`mode-tab ${mode === "register" ? "active" : ""}`}
          onClick={() => switchMode("register")}
        >
          Register
        </div>
        <div
          className={`mode-tab ${mode === "forgot" ? "active" : ""}`}
          onClick={() => switchMode("forgot")}
        >
          Forgot
        </div>
      </div>

      {mode === "login" && (
        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Roll number</label>
            <input value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Login
          </button>
        </form>
      )}

      {mode !== "login" && step === "enterRoll" && (
        <form onSubmit={handleRequestOtp}>
          <div className="field">
            <label>Roll number</label>
            <input value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
            <p className="field-hint">
              An OTP will be sent to {rollNumber || "<rollNumber>"}@mmmut.ac.in
            </p>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Send OTP
          </button>
        </form>
      )}

      {mode !== "login" && step === "enterOtp" && (
        <form onSubmit={handleVerifyOtp}>
          <div className="field">
            <label>Enter the 6-digit OTP</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Verify OTP
          </button>
        </form>
      )}

      {mode === "register" && step === "enterDetails" && (
        <form onSubmit={handleCompleteRegister}>
          <div className="field">
            <label>Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="field">
            <label>Set a password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Create account
          </button>
        </form>
      )}

      {mode === "forgot" && step === "enterNewPassword" && (
        <form onSubmit={handleCompleteReset}>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Reset password
          </button>
        </form>
      )}

      {status && <p className="field-hint">{status}</p>}
    </div>
  );
}
