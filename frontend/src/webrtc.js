// Wraps the browser's RTCPeerConnection so App.jsx doesn't need to know
// the low-level WebRTC details.

// Free public STUN server — works for most networks with open NAT.
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

// TURN relays traffic through a server when two peers can't connect
// directly (common on strict/symmetric NATs, some college networks).
// Only added if credentials are actually configured — see .env.example.
if (import.meta.env.VITE_TURN_URL) {
  ICE_SERVERS.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  });
}

export function createPeerConnection({ onRemoteStream, onIceCandidate, onConnectionStateChange }) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.ontrack = (event) => {
    console.log("[webrtc] ontrack fired, kind:", event.track.kind);
    onRemoteStream(event.streams[0]);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onIceCandidate(event.candidate);
    }
  };

  // Surfaces connection health to the UI: "connecting" | "connected" |
  // "disconnected" | "failed" | "closed". Lets App.jsx show a status
  // and attempt an ICE restart if the connection drops mid-call.
  pc.onconnectionstatechange = () => {
    console.log("[webrtc] connectionState:", pc.connectionState);
    onConnectionStateChange?.(pc.connectionState);
  };

  // More granular than connectionState — helps tell "still checking
  // candidate pairs" apart from "found nothing that works".
  pc.oniceconnectionstatechange = () => {
    console.log("[webrtc] iceConnectionState:", pc.iceConnectionState);
  };
  pc.onicegatheringstatechange = () => {
    console.log("[webrtc] iceGatheringState:", pc.iceGatheringState);
  };

  return pc;
}

// Attempts to recover a dropped connection without a full re-match —
// renegotiates ICE only, keeping the existing match/room intact.
export async function restartIce(pc, socket) {
  const offer = await pc.createOffer({ iceRestart: true });
  await pc.setLocalDescription(offer);
  socket.emit("webrtc-offer", offer);
}

export async function getLocalStream() {
  return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
}

