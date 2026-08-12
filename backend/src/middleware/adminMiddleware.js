import User from "../models/User.js";

// Must run after requireAuth — checks the logged-in user has isAdmin: true.
export async function requireAdmin(req, res, next) {
  const user = await User.findById(req.user.id);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
