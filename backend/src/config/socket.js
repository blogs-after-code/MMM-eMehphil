import { Server } from "socket.io";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware.js";
import {
  addToQueue,
  removeFromQueue,
  tryMatch,
  getMatch,
  endMatch,
} from "./matchmaking.js";
import { getYearOfStudy } from "../utils/yearUtils.js";

// Tracks who's currently connected: rollNumber -> socket.id
// (In-memory for now — fine for a single server instance.)
export const onlineUsers = new Map();

export function initSocket(httpServer, corsOptions) {
  const io = new Server(httpServer, {
    cors: corsOptions,
  });

  io.use(socketAuthMiddleware);

  function broadcastOnlineCount() {
    io.emit("online-count", onlineUsers.size);
  }

  // Notifies both matched users and puts their sockets in the same room
  function notifyMatch(userA, userB, roomId) {
    const socketA = io.sockets.sockets.get(onlineUsers.get(userA));
    const socketB = io.sockets.sockets.get(onlineUsers.get(userB));

    socketA?.join(roomId);
    socketB?.join(roomId);

    socketA?.emit("matched", { roomId, partner: userB });
    socketB?.emit("matched", { roomId, partner: userA });
  }

  // Ends the current match for a user and tells their (former) partner.
  // Used on both "next"/"stop" (self-initiated) and "disconnect".
  // Takes the caller's own socket so IT also leaves the room — previously
  // only the partner's socket left, so the caller stayed subscribed to a
  // "dead" room and could keep receiving/relaying stale signaling messages
  // into whatever match they joined next.
  function leaveCurrentMatch(socket, rollNumber) {
    const match = endMatch(rollNumber);
    if (!match) return;

    socket.leave(match.roomId);

    const partnerSocket = io.sockets.sockets.get(onlineUsers.get(match.partnerRollNumber));
    partnerSocket?.leave(match.roomId);
    partnerSocket?.emit("partner-left");
  }

  io.on("connection", (socket) => {
    const { rollNumber } = socket.user;
    onlineUsers.set(rollNumber, socket.id);
    console.log(`Socket connected: ${rollNumber} (${socket.id})`);
    broadcastOnlineCount();

    socket.on("ping", () => {
      socket.emit("pong", { message: "Server received your ping", at: Date.now() });
    });

    // User clicks "Start" — join the waiting pool.
    // filterYear: null = match with anyone, or a specific year number to restrict to.
    socket.on("find-match", (filterYear = null) => {
      // If already matched, leave that match first
      if (getMatch(rollNumber)) {
        leaveCurrentMatch(socket, rollNumber);
      }

      const year = getYearOfStudy(rollNumber);
      addToQueue(rollNumber, year, filterYear);
      socket.emit("waiting");

      const result = tryMatch();
      if (result) {
        notifyMatch(result.userA, result.userB, result.roomId);
      }
    });

    // User clicks "Next" — leave current match, straight back into the pool
    // with the same filter preference they started with.
    socket.on("next", (filterYear = null) => {
      leaveCurrentMatch(socket, rollNumber);
      const year = getYearOfStudy(rollNumber);
      addToQueue(rollNumber, year, filterYear);
      socket.emit("waiting");

      const result = tryMatch();
      if (result) {
        notifyMatch(result.userA, result.userB, result.roomId);
      }
    });

    // User sends a text message — relay it to their current match's room only
    socket.on("chat-message", (text) => {
      const match = getMatch(rollNumber);
      if (!match) return; // not currently matched, ignore

      if (typeof text !== "string" || !text.trim()) return;
      const trimmed = text.trim().slice(0, 1000); // basic length guard

      // Send to everyone in the room except the sender (partner only, since room has 2 people)
      socket.to(match.roomId).emit("chat-message", {
        from: rollNumber,
        text: trimmed,
        at: Date.now(),
      });
    });

    // --- WebRTC signaling relay ---
    // The server never sees video/audio — it just passes these 3 message
    // types between the two matched users so their browsers can set up a
    // direct peer-to-peer connection.

    socket.on("webrtc-offer", (offer) => {
      const match = getMatch(rollNumber);
      if (!match) return;
      socket.to(match.roomId).emit("webrtc-offer", { from: rollNumber, offer, roomId: match.roomId });
    });

    socket.on("webrtc-answer", (answer) => {
      const match = getMatch(rollNumber);
      if (!match) return;
      socket.to(match.roomId).emit("webrtc-answer", { from: rollNumber, answer, roomId: match.roomId });
    });

    socket.on("webrtc-ice-candidate", (candidate) => {
      const match = getMatch(rollNumber);
      if (!match) return;
      socket.to(match.roomId).emit("webrtc-ice-candidate", { from: rollNumber, candidate, roomId: match.roomId });
    });

    // User clicks "Stop" — leave queue/match without looking for a new one
    socket.on("stop", () => {
      removeFromQueue(rollNumber);
      leaveCurrentMatch(socket, rollNumber);
    });

    socket.on("disconnect", () => {
      removeFromQueue(rollNumber);
      leaveCurrentMatch(socket, rollNumber);
      onlineUsers.delete(rollNumber);
      console.log(`Socket disconnected: ${rollNumber}`);
      broadcastOnlineCount();
    });
  });

  return io;
}

