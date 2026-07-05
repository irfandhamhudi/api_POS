import Shift from "../models/Shift.js";
import Transaction from "../models/Transaction.js";
import Notification from "../models/Notification.js";

const OPEN_HOUR =
  process.env.OPEN_HOUR !== undefined ? parseInt(process.env.OPEN_HOUR) : 0;
const CLOSE_HOUR =
  process.env.CLOSE_HOUR !== undefined ? parseInt(process.env.CLOSE_HOUR) : 24;

// Helper to automatically close shifts that are active after operational hours or on previous days
const autoCloseExpiredShifts = async () => {
  try {
    const now = new Date();
    const currentHour = now.getHours();

    // Find all active shifts and populate cashier details to get their names for notifications
    const activeShifts = await Shift.find({ status: "active" }).populate(
      "cashier",
    );

    for (const shift of activeShifts) {
      const shiftStart = new Date(shift.startTime);

      // Check if day has changed (shift started on a previous day)
      const isPreviousDay =
        shiftStart.getFullYear() < now.getFullYear() ||
        (shiftStart.getFullYear() === now.getFullYear() &&
          shiftStart.getMonth() < now.getMonth()) ||
        (shiftStart.getFullYear() === now.getFullYear() &&
          shiftStart.getMonth() === now.getMonth() &&
          shiftStart.getDate() < now.getDate());

      // Check if current time is past operational close hour (21:00)
      const isPastCloseHour = currentHour >= CLOSE_HOUR;

      if (isPreviousDay || isPastCloseHour) {
        // Auto close this shift
        const totalCashouts = (shift.cashouts || []).reduce(
          (sum, c) => sum + (c.amount || 0),
          0,
        );

        // Expected ending cash
        const expectedCash =
          shift.startingCash + shift.totalSales - totalCashouts;
        shift.endingCash = expectedCash;

        // End time is either 21:00 of the shift start day, or current time
        const endOfShiftTime = new Date(shiftStart);
        endOfShiftTime.setHours(CLOSE_HOUR, 0, 0, 0);

        shift.endTime = endOfShiftTime < now ? endOfShiftTime : now;
        shift.status = "closed";
        shift.difference = 0;

        await shift.save();

        // Create a warning notification in the system
        const cashierName = shift.cashier?.name || "Cashier";
        await Notification.create({
          title: "Shift Ended Automatically",
          message: `Shift for ${cashierName} was automatically ended by the system because operational hours have ended.`,
          type: "warning",
          source: "all",
        });

        console.log(
          `Auto-closed expired shift ${shift._id} for cashier ${cashierName}`,
        );
      }
    }
  } catch (err) {
    console.error("Error auto-closing expired shifts:", err);
  }
};

// @desc    Get all shifts
// @route   GET /api/shifts
const getShifts = async (req, res) => {
  try {
    await autoCloseExpiredShifts();
    const { cashier, status } = req.query;
    const filter = {};
    if (cashier) filter.cashier = cashier;
    if (status) filter.status = status;
    const shifts = await Shift.find(filter)
      .populate("cashier", "name username")
      .sort("-createdAt")
      .limit(100);
    const mapped = shifts.map((s) => {
      const shift = s.toObject();
      shift.cashierName = shift.cashier?.name || "Unknown";
      shift.cashSales = shift.totalCash || 0;
      shift.cardSales = shift.totalCard || 0;
      shift.qrisSales = shift.totalQris || 0;
      shift.totalCashouts = (shift.cashouts || []).reduce(
        (sum, c) => sum + (c.amount || 0),
        0,
      );
      return shift;
    });
    res.status(200).json({ success: true, count: mapped.length, data: mapped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get active shift for current user
// @route   GET /api/shifts/active
const getActiveShift = async (req, res) => {
  try {
    await autoCloseExpiredShifts();
    const shift = await Shift.findOne({
      cashier: req.user._id,
      status: "active",
    });
    res.status(200).json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Start a new shift (clock in)
// @route   POST /api/shifts/start
const startShift = async (req, res) => {
  try {
    const now = new Date();
    const hour = now.getHours();
    if (hour < OPEN_HOUR || hour >= CLOSE_HOUR) {
      return res.status(400).json({
        success: false,
        message: `Can only clock in between ${OPEN_HOUR}:00 and ${CLOSE_HOUR}:00`,
      });
    }

    await autoCloseExpiredShifts();

    const activeShift = await Shift.findOne({
      cashier: req.user._id,
      status: "active",
    });
    if (activeShift) {
      return res
        .status(400)
        .json({ success: false, message: "You already have an active shift" });
    }

    const { startingCash } = req.body;
    const shift = await Shift.create({
      cashier: req.user._id,
      startingCash: startingCash || 0,
    });
    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    End shift (clock out)
// @route   PUT /api/shifts/:id/end
const endShift = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);
    if (!shift) {
      return res
        .status(404)
        .json({ success: false, message: "Shift not found" });
    }
    if (shift.status === "closed") {
      return res
        .status(400)
        .json({ success: false, message: "Shift already closed" });
    }

    const { endingCash } = req.body;
    const totalCashouts = (shift.cashouts || []).reduce(
      (sum, c) => sum + (c.amount || 0),
      0,
    );
    shift.endingCash = endingCash || 0;
    shift.endTime = new Date();
    shift.status = "closed";
    shift.difference =
      endingCash - (shift.startingCash + shift.totalSales - totalCashouts);

    await shift.save();
    res.status(200).json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get shift report
// @route   GET /api/shifts/:id/report
const getShiftReport = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id).populate(
      "cashier",
      "name username",
    );
    if (!shift) {
      return res
        .status(404)
        .json({ success: false, message: "Shift not found" });
    }

    const transactions = await Transaction.find({
      cashier: shift.cashier,
      createdAt: { $gte: shift.startTime, $lte: shift.endTime || new Date() },
      status: "completed",
    }).populate("items.product", "name price");

    res.status(200).json({ success: true, data: { shift, transactions } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add cashout during active shift
// @route   POST /api/shifts/:id/cashout
const addCashout = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);
    if (!shift) {
      return res
        .status(404)
        .json({ success: false, message: "Shift not found" });
    }
    if (shift.status !== "active") {
      return res
        .status(400)
        .json({ success: false, message: "Shift is not active" });
    }

    const { amount, description } = req.body;
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid cashout amount" });
    }

    shift.cashouts.push({
      amount,
      description: description || "",
      createdAt: new Date(),
    });
    await shift.save();
    res.status(200).json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete shift
// @route   DELETE /api/shifts/:id
const deleteShift = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);
    if (!shift) {
      return res
        .status(404)
        .json({ success: false, message: "Shift not found" });
    }
    await shift.deleteOne();
    res.status(200).json({ success: true, message: "Shift deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get today's cashouts (for report)
// @route   GET /api/shifts/cashouts/today
const getTodayCashouts = async (req, res) => {
  try {
    let start = new Date();
    start.setHours(0, 0, 0, 0);
    let end = new Date();
    end.setHours(23, 59, 59, 999);

    if (req.query.startDate) {
      start = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      end = new Date(req.query.endDate);
    }

    const shifts = await Shift.find({
      startTime: { $gte: start, $lte: end },
    });

    const cashouts = [];
    shifts.forEach((shift) => {
      if (shift.cashouts?.length) {
        shift.cashouts.forEach((co) => {
          const coDate = new Date(co.createdAt);
          if (coDate >= start && coDate <= end) {
            cashouts.push({
              amount: co.amount,
              description: co.description,
              createdAt: co.createdAt,
            });
          }
        });
      }
    });

    res.status(200).json({ success: true, data: cashouts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get active shift status (public)
// @route   GET /api/shifts/public/active
const getActiveShiftPublic = async (req, res) => {
  try {
    await autoCloseExpiredShifts();
    const shift = await Shift.findOne({ status: "active" });
    res.status(200).json({ success: true, active: !!shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get shift settings
// @route   GET /api/shifts/settings
const getShiftSettings = async (req, res) => {
  try {
    const now = new Date();
    res.status(200).json({
      success: true,
      data: {
        openHour: OPEN_HOUR,
        closeHour: CLOSE_HOUR,
        now: now.getHours(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
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
};
