import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Creates a fresh authenticated socket connection using the JWT from login.
export function createSocket(token) {
  return io(SOCKET_URL, {
    auth: { token },
    autoConnect: false,
  });
}
