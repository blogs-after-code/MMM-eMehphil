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

  function handleAuthenticated(token, myRollNumber) {
    tokenRef.current = token;
    setRollNumber(myRollNumber);
    setIsAuthenticated(true);
    setStatus("Logged in — connecting socket...");
    connectSocket(token);
  }

  function connectSocket(token) {
    const socket = createSocket(token);
    socketRef.current = socket;

      socket.on("connect", () => setStatus(`Socket connected: ${socket.id}`));
      socket.on("connect_error", (err) => setStatus(`Socket error: ${err.message}`));
      socket.on("disconnect", () => setStatus("Socket disconnected"));

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
    const pc = pcRef.current;
    if (!pc) {
      pendingSignalsRef.current.push({ type, data });
      return;
    }

    if (type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", answer);
    } else if (type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (type === "ice") {
      if (!data.candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error("Failed to add ICE candidate", err);
      }
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

    const pc = createPeerConnection({
      onRemoteStream: (remoteStream) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      },
      onIceCandidate: (candidate) => {
        socket.emit("webrtc-ice-candidate", candidate);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        // "failed" means the direct connection attempt didn't work (e.g. strict
        // NAT with no TURN server reachable) — try renegotiating once.
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

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 400 }}>
      <h1>MMM eMehphil</h1>

      {!isAuthenticated ? (
        <Auth onAuthenticated={handleAuthenticated} />
      ) : (
        <>
          <p style={{ marginTop: 16 }}>
            <strong>Status:</strong> {status}
          </p>

          <hr />

          <p>
            <strong>Match status:</strong> {matchStatus}
            {partner && ` — paired with ${partner}`}
          </p>

      {matchStatus === "idle" && (
        <div style={{ marginBottom: 8 }}>
          <label>
            <input
              type="radio"
              checked={filterMode === "any"}
              onChange={() => setFilterMode("any")}
            />{" "}
            Match with anyone
          </label>{" "}
          <label>
            <input
              type="radio"
              checked={filterMode === "ownYear"}
              onChange={() => setFilterMode("ownYear")}
            />{" "}
            Match with my year only
          </label>
        </div>
      )}

      <button onClick={findMatch} disabled={matchStatus !== "idle"}>
        Start
      </button>{" "}
      <button onClick={nextMatch} disabled={matchStatus !== "matched"}>
        Next
      </button>{" "}
      <button onClick={stopMatch} disabled={matchStatus === "idle"}>
        Stop
      </button>

      {matchStatus !== "idle" && (
        <div style={{ marginTop: 16 }}>
          {connectionState && (
            <p style={{ margin: "0 0 8px" }}>
              <strong>Video connection:</strong> {connectionState}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ width: "48%" }}>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                style={{ width: "100%", background: "#000", display: "block" }}
              />
              {/* Voice-level meter — fills based on mic input, so the user
                  can see their voice is being picked up before they're even matched. */}
              <div style={{ height: 8, background: "#eee", marginTop: 4 }}>
                <div
                  ref={voiceBarRef}
                  style={{
                    height: "100%",
                    width: "0%",
                    background: "limegreen",
                  }}
                />
              </div>
            </div>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ width: "48%", background: "#000" }}
            />
          </div>

          {matchStatus === "matched" && (
            <>
              <div
                style={{
                  border: "1px solid #ccc",
                  height: 200,
                  overflowY: "auto",
                  padding: 8,
                  marginTop: 12,
                  marginBottom: 8,
                }}
              >
                {messages.map((m, i) => (
                  <div key={i}>
                    <strong>{m.from === "me" ? "Me" : m.from}:</strong> {m.text}
                  </div>
                ))}
              </div>
              <form onSubmit={sendMessage}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..."
                  style={{ width: "75%" }}
                />
                <button type="submit">Send</button>
              </form>

              <div style={{ marginTop: 16, borderTop: "1px solid #ccc", paddingTop: 8 }}>
                <form onSubmit={sendReport}>
                  <label>Report this user</label>
                  <br />
                  <input
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder="Reason (e.g. abuse, obscene content)"
                    style={{ width: "75%" }}
                  />
                  <button type="submit">Report</button>
                </form>
                {reportStatus && <p>{reportStatus}</p>}
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
