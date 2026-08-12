import jwt from "jsonwebtoken";

// Runs before a socket connection is accepted.
// Client must send the JWT as: io(url, { auth: { token: "..." } })
export function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("No token provided"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded; // { id, rollNumber }
    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
}
