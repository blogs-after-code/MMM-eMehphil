import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import User from "../models/User.js";

const router = express.Router();

// Protected route - proves the JWT auth flow works end-to-end
router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-passwordHash");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

export default router;
