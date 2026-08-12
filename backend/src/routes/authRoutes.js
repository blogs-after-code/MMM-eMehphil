import express from "express";
import { register, login, requestOtp, verifyOtp, resetPassword } from "../controllers/authController.js";

const router = express.Router();

router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);
router.post("/register", register);
router.post("/reset-password", resetPassword);
router.post("/login", login);

export default router;
