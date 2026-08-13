import { useState, useEffect, useRef } from "react";
import { submitReport } from "./api.js";
import { createSocket } from "./socket.js";
import { createPeerConnection, getLocalStream, restartIce } from "./webrtc.js";
import { createAudioMeter } from "./audioMeter.js";
import { getYearOfStudy } from "./yearUtils.js";
import Auth from "./Auth.jsx";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [rollNumber, setRollNumber] = useState("");
  const [status, setStatus] = useState("Not logged in");
  const [onlineCount, setOnlineCount] = useState(null);
  const [matchStatus, setMatchStatus] = useState("idle"); // idle | previewing | waiting | matched
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]); // { from, text, at }
  const [chatInput, setChatInput] = useState("");
  const [connectionState, setConnectionState] = useState(null); // WebRTC peer connection health
  const [filterMode, setFilterMode] = useState("any"); // "any" | "ownYear"
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState(null);

  const socketRef = useRef(null);
  const tokenRef = useRef(null);
  const pcRef = useRef(null); // RTCPeerConnection for the current match
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pendingSignalsRef = useRef([]); // buffers offer/answer/ICE that arrive before pcRef is ready
  const stopMeterRef = useRef(null); // cleanup function for the audio meter
  const roomIdRef = useRef(null); // current match's room, needed for reporting
  const voiceBarRef = useRef(null); // updated directly (not via React state) so it stays smooth at 60fps
  const connectingSinceRef = useRef(null); // timestamp — used to decide when to show the connection tip

  function handleAuthenticated(token, myRollNumber) {
    tokenRef.current = token;
    setRollNumber(myRollNumber);
    setIsAuthenticated(true);
    setStatus("Logged in — connecting...");
    connectSocket(token);
  }

  function connectSocket(token) {
    const socket = createSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => setStatus("Connected"));
    socket.on("connect_error", (err) => setStatus(`Connection error: ${err.message}`));
    socket.on("disconnect", () => setStatus("Disconnected"));
    socket.on("online-count", (count) => setOnlineCount(count));

    socket.on("waiting", () => {
      setMatchStatus("waiting");
      setPartner(null);
      setMessages([]);
      roomIdRef.current = null;
      teardownPeerConnection(); // in case we just clicked Next — don't leave the old call open
    });

    socket.on("matched", async (data) => {
      setMatchStatus("matched");
      setPartner(data.partner);
      setMessages([]);
      setReportStatus(null);
      roomIdRef.current = data.roomId;
      teardownPeerConnection(); // clean up any leftover connection, keep camera preview running
      // We become the "offerer" if our roll number sorts first — deterministic,
      // so both sides agree who initiates without extra signaling.
      const isOfferer = rollNumber < data.partner;
      await setupWebRTC(socket, isOfferer);
    });

    socket.on("webrtc-offer", (data) => handleSignal(socket, "offer", data));
    socket.on("webrtc-answer", (data) => handleSignal(socket, "answer", data));
    socket.on("webrtc-ice-candidate", (data) => handleSignal(socket, "ice", data));

    socket.on("chat-message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("partner-left", () => {
      setMatchStatus("previewing"); // back to solo preview, not fully idle — camera stays on
      setPartner(null);
      setMessages([]);
      roomIdRef.current = null;
      teardownPeerConnection();
    });

    socket.connect();
  }

  // Runs the moment the user clicks Start — gets camera/mic access and shows
  // the local preview + voice meter immediately, well before any match exists.
  async function startPreview() {
    if (localStreamRef.current) return; // already previewing (e.g. Next was clicked)

    const stream = await getLocalStream();
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    stopMeterRef.current = createAudioMeter(stream, (level) => {
      if (voiceBarRef.current) voiceBarRef.current.style.width = `${level * 100}%`;
    });
  }

  // Applies one signaling message (offer/answer/ICE) to the current peer
  // connection. If the peer connection isn't set up yet, the message is
  // buffered and replayed once it is — this is what fixes the "remote video
  // doesn't show up on first match" race, where an offer can arrive before
  // this side has finished setting up its peer connection.
  async function handleSignal(socket, type, data) {
    // Reject signals left over from a previous match — the server now also
    // makes us leave the old Socket.IO room, but a message already in
    // flight when that happens could still arrive; this is the belt-and-
    // suspenders check that stops it from being applied to the new match.
    if (data.roomId && data.roomId !== roomIdRef.current) return;

    const pc = pcRef.current;
    if (!pc) {
      pendingSignalsRef.current.push({ type, data });
      return;
    }

    // ICE candidates can only be applied once a remote description exists —
    // otherwise addIceCandidate throws. A candidate can easily arrive over
    // the socket while we're still mid-way through setting the remote
    // description (several awaits above), so check readiness, not just
    // "does the peer connection object exist".
    if (type === "ice" && !pc.remoteDescription) {
      pendingSignalsRef.current.push({ type, data });
      return;
    }

    try {
      if (type === "offer") {
        // Only valid when we're not mid-negotiation already — avoids "glare"
        // if both sides send an offer around the same time (e.g. after an
        // ICE restart racing with a normal renegotiation).
        if (pc.signalingState !== "stable") return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc-answer", answer);
        await drainPendingSignals(socket); // flush any ICE candidates queued during the above
      } else if (type === "answer") {
        // Only valid right after we sent an offer — a late/duplicate answer
        // (e.g. overlapping with an ICE restart) would otherwise throw
        // "Called in wrong state: stable" and silently break the call.
        if (pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await drainPendingSignals(socket); // flush any ICE candidates queued during the above
      } else if (type === "ice") {
        if (!data.candidate) return;
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.error(`Failed to handle ${type}`, err);
    }
  }

  async function drainPendingSignals(socket) {
    const queued = pendingSignalsRef.current;
    pendingSignalsRef.current = [];
    for (const { type, data } of queued) {
      await handleSignal(socket, type, data);
    }
  }

  // Sets up the peer connection for a match, reusing the camera/mic stream
  // that's already running from the preview — no second permission prompt.
  async function setupWebRTC(socket, isOfferer) {
    const stream = localStreamRef.current;
    if (!stream) return; // shouldn't happen — preview always starts before a match

    connectingSinceRef.current = Date.now();

    const pc = createPeerConnection({
      onRemoteStream: (remoteStream) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      },
      onIceCandidate: (candidate) => {
        socket.emit("webrtc-ice-candidate", candidate);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        if (state === "connected") connectingSinceRef.current = null;
        // "failed" means the direct connection attempt didn't work (e.g. strict
        // NAT/college wifi with no TURN server reachable) — try renegotiating once.
        if (state === "failed") {
          restartIce(pc, socket).catch((err) =>
            console.error("ICE restart failed", err)
          );
        }
      },
    });
    pcRef.current = pc;

    // Tracks must be attached before we process any incoming offer — otherwise
    // an answer gets generated (and sent) without our video/audio in it, and
    // our partner never receives our stream even though the connection "works".
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    await drainPendingSignals(socket);

    if (isOfferer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", offer);
    }
  }

  // Closes the peer connection only — camera preview keeps running.
  // Used between matches (Next, partner-left) so the user doesn't get
  // re-prompted for camera permission every time.
  function teardownPeerConnection() {
    pcRef.current?.close();
    pcRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setConnectionState(null);
    pendingSignalsRef.current = [];
    connectingSinceRef.current = null;
  }

  // Full teardown — stops the camera/mic and the voice meter too.
  // Used on Stop and on unmount.
  function teardownAll() {
    teardownPeerConnection();

    stopMeterRef.current?.();
    stopMeterRef.current = null;
    if (voiceBarRef.current) voiceBarRef.current.style.width = "0%";

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  }

  async function findMatch() {
    setMatchStatus("previewing");
    await startPreview();
    const filterYear = filterMode === "ownYear" ? getYearOfStudy(rollNumber) : null;
    socketRef.current?.emit("find-match", filterYear);
  }

  function nextMatch() {
    const filterYear = filterMode === "ownYear" ? getYearOfStudy(rollNumber) : null;
    socketRef.current?.emit("next", filterYear);
  }

  function stopMatch() {
    socketRef.current?.emit("stop");
    setMatchStatus("idle");
    setPartner(null);
    setMessages([]);
    roomIdRef.current = null;
    teardownAll();
  }

  async function sendReport(e) {
    e.preventDefault();
    if (!reportReason.trim() || !partner) return;

    setReportStatus("Submitting...");
    try {
      await submitReport(tokenRef.current, {
        reportedRollNumber: partner,
        reason: reportReason.trim(),
        roomId: roomIdRef.current,
      });
      setReportStatus("Report submitted. Thank you.");
      setReportReason("");
    } catch (err) {
      setReportStatus(`Failed to submit: ${err.response?.data?.error || err.message}`);
    }
  }

  function sendMessage(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;

    socketRef.current?.emit("chat-message", chatInput);
    // Show our own message immediately (server only relays to the partner)
    setMessages((prev) => [...prev, { from: "me", text: chatInput, at: Date.now() }]);
    setChatInput("");
  }

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      teardownAll();
    };
  }, []);

  // Show a tip nudging users toward mobile data / network tweaks if a
  // connection is stuck "connecting" for a while, or has failed — since
  // this project intentionally avoids relying on a TURN server.
  const showConnectionTip =
    connectionState === "failed" ||
    connectionState === "disconnected" ||
    (connectionState === "connecting" && matchStatus === "matched");

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1 className="brand">MMM eMehphil</h1>
        {isAuthenticated && onlineCount !== null && (
          <div className="online-pill">
            <span className="online-dot" />
            {onlineCount} online
          </div>
        )}
      </div>

      {!isAuthenticated ? (
        <div className="card">
          <Auth onAuthenticated={handleAuthenticated} />
        </div>
      ) : (
        <>
          <div className="card">
            <p className="status-line">
              <strong>{status}</strong>
            </p>
            <p className="status-line">
              Status: <span className={`badge badge-${matchStatus}`}>{matchStatus}</span>
              {partner && <> — paired with <strong>{partner}</strong></>}
            </p>

            {matchStatus === "idle" && (
              <div className="filter-row">
                <label>
                  <input
                    type="radio"
                    checked={filterMode === "any"}
                    onChange={() => setFilterMode("any")}
                  />
                  Match with anyone
                </label>
                <label>
                  <input
                    type="radio"
                    checked={filterMode === "ownYear"}
                    onChange={() => setFilterMode("ownYear")}
                  />
                  My year only
                </label>
              </div>
            )}

            <div className="btn-row">
              <button
                className="btn btn-primary"
                onClick={findMatch}
                disabled={matchStatus !== "idle"}
              >
                Start
              </button>
              <button
                className="btn btn-secondary"
                onClick={nextMatch}
                disabled={matchStatus !== "matched"}
              >
                Next
              </button>
              <button
                className="btn btn-danger"
                onClick={stopMatch}
                disabled={matchStatus === "idle"}
              >
                Stop
              </button>
            </div>
          </div>

          {matchStatus !== "idle" && (
            <div className="card">
              {connectionState && (
                <p className="status-line">
                  Video connection: <strong>{connectionState}</strong>
                </p>
              )}
              <div className="video-grid">
                <div className="video-tile">
                  <video ref={localVideoRef} autoPlay muted playsInline />
                  <span className="video-label">You</span>
                  <div className="voice-meter">
                    <div ref={voiceBarRef} className="voice-meter-fill" />
                  </div>
                </div>
                <div className="video-tile">
                  <video ref={remoteVideoRef} autoPlay playsInline />
                  {partner && <span className="video-label">{partner}</span>}
                </div>
              </div>

              {showConnectionTip && (
                <div className="connection-tip">
                  Having trouble connecting? College wifi sometimes blocks direct
                  video connections. Try switching to mobile data, or check that
                  your firewall/VPN isn't blocking WebRTC.
                </div>
              )}

              {matchStatus === "matched" && (
                <>
                  <div className="chat-box">
                    {messages.map((m, i) => (
                      <div className="chat-msg" key={i}>
                        <span className="from">{m.from === "me" ? "Me" : m.from}:</span>
                        {m.text}
                      </div>
                    ))}
                  </div>
                  <form className="chat-input-row" onSubmit={sendMessage}>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                    />
                    <button className="btn btn-secondary" type="submit">
                      Send
                    </button>
                  </form>

                  <div className="report-section">
                    <form onSubmit={sendReport}>
                      <div className="field">
                        <label>Report this user</label>
                        <input
                          value={reportReason}
                          onChange={(e) => setReportReason(e.target.value)}
                          placeholder="Reason (e.g. abuse, obscene content)"
                        />
                      </div>
                      <button className="btn btn-danger" type="submit">
                        Report
                      </button>
                    </form>
                    {reportStatus && <p className="field-hint">{reportStatus}</p>}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
