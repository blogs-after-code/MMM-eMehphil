import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";
import {
  submitReport,
  listReports,
  banReportedUser,
  dismissReport,
} from "../controllers/reportController.js";

const router = express.Router();

// Any logged-in user can submit a report
router.post("/", requireAuth, submitReport);

// Admin-only: review, ban, dismiss
router.get("/", requireAuth, requireAdmin, listReports);
router.post("/:reportId/ban", requireAuth, requireAdmin, banReportedUser);
router.post("/:reportId/dismiss", requireAuth, requireAdmin, dismissReport);

export default router;
