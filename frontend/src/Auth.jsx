import { useState } from "react";
import { login, register } from "./api.js";

// Handles login and registration.
// Registration is whitelist-only: the roll number must already be on the
// university's pre-loaded list (see backend/src/config/seedRollNumbers.js).
// No OTP/email verification for now (see project notes on email delivery costs).
export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login"); // "login" | "register"

  const [rollNumber, setRollNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  function switchMode(newMode) {
    setMode(newMode);
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

  async function handleRegister(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("Creating your account...");
    try {
      const { token } = await register(rollNumber, displayName, password);
      onAuthenticated(token, rollNumber.trim().toUpperCase());
    } catch (err) {
      setStatus(`Registration failed: ${err.response?.data?.error || err.message}`);
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

      {mode === "register" && (
        <form onSubmit={handleRegister}>
          <div className="field">
            <label>Roll number</label>
            <input value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
          </div>
          <div className="field">
            <label>Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
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
            Register
          </button>
        </form>
      )}

      {status && <p className="field-hint">{status}</p>}
    </div>
  );
}
