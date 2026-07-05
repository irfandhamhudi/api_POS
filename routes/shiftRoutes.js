import express from "express";
const router = express.Router();
import {
  getShifts,
  getActiveShift,
  startShift,
  endShift,
  getShiftReport,
  addCashout,
  deleteShift,
  getTodayCashouts,
  getActiveShiftPublic,
  getShiftSettings,
} from "../controllers/shiftController.js";
import { protect, admin } from "../middlewares/authMiddleware.js";

router.get("/settings", getShiftSettings);
router.get("/public/active", getActiveShiftPublic);
router.get("/cashouts/today", protect, getTodayCashouts);
router.get("/active", protect, getActiveShift);
router.post("/start", protect, startShift);
router.put("/:id/end", protect, endShift);
router.get("/:id/report", protect, getShiftReport);
router.post("/:id/cashout", protect, addCashout);
router.delete("/:id", protect, admin, deleteShift);
router.get("/", protect, admin, getShifts);

export default router;
