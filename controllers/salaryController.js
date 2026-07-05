import SalaryConfig from '../models/SalaryConfig.js';
import Payroll from '../models/Payroll.js';
import User from '../models/User.js';
import Shift from '../models/Shift.js';

// Helper to get period dates based on cutoff day
const getPeriodDates = (year, month, cutoffDay) => {
  const yr = parseInt(year);
  const mo = parseInt(month) - 1; // JS month is 0-indexed

  let startDate, endDate;
  if (cutoffDay >= 28 || cutoffDay === 0) {
    // Calendar month: e.g. 1st to last day of selected month
    startDate = new Date(yr, mo, 1, 0, 0, 0, 0);
    endDate = new Date(yr, mo + 1, 0, 23, 59, 59, 999);
  } else {
    // Custom cutoff: e.g. 25th
    // Start date is 26th of previous month
    startDate = new Date(yr, mo - 1, cutoffDay + 1, 0, 0, 0, 0);
    // End date is 25th of current month
    endDate = new Date(yr, mo, cutoffDay, 23, 59, 59, 999);
  }
  return { startDate, endDate };
};

// @desc    Get global salary configuration
// @route   GET /api/salaries/config
export const getSalaryConfig = async (req, res) => {
  try {
    let config = await SalaryConfig.findOne();
    if (!config) {
      config = await SalaryConfig.create({
        dailySalary: 85000,
        monthlyHolidays: 4,
        cutoffDay: 25,
      });
    }
    res.status(200).json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update global salary configuration
// @route   POST /api/salaries/config
export const updateSalaryConfig = async (req, res) => {
  try {
    const { dailySalary, monthlyHolidays, cutoffDay } = req.body;
    let config = await SalaryConfig.findOne();
    if (config) {
      config.dailySalary = dailySalary !== undefined ? dailySalary : config.dailySalary;
      config.monthlyHolidays = monthlyHolidays !== undefined ? monthlyHolidays : config.monthlyHolidays;
      config.cutoffDay = cutoffDay !== undefined ? cutoffDay : config.cutoffDay;
      await config.save();
    } else {
      config = await SalaryConfig.create({
        dailySalary: dailySalary || 85000,
        monthlyHolidays: monthlyHolidays || 4,
        cutoffDay: cutoffDay || 25,
      });
    }
    res.status(200).json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Calculate payroll data for all cashiers for a given period
// @route   GET /api/salaries/calculate
export const calculatePayroll = async (req, res) => {
  try {
    const { period } = req.query; // format: YYYY-MM (e.g. "2026-06")
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ success: false, message: 'Invalid period format. Use YYYY-MM' });
    }

    const [year, month] = period.split('-');
    const config = await SalaryConfig.findOne() || { dailySalary: 85000, monthlyHolidays: 4, cutoffDay: 25 };
    const { startDate, endDate } = getPeriodDates(year, month, config.cutoffDay);

    // Fetch all active/inactive cashiers (users with role cashier)
    const employees = await User.find({ role: 'cashier' }).select('name username disabled bankName bankAccountNumber');

    const calculatedData = [];

    for (const emp of employees) {
      // Find closed shifts for this cashier in the period
      const shifts = await Shift.find({
        cashier: emp._id,
        status: 'closed',
        startTime: { $gte: startDate, $lte: endDate },
      });

      // Count unique days worked
      const uniqueDays = new Set();
      shifts.forEach((s) => {
        const dStr = new Date(s.startTime).toLocaleDateString('en-CA'); // YYYY-MM-DD format in local timezone
        uniqueDays.add(dStr);
      });
      const calculatedWorkDays = uniqueDays.size;

      // Check if a payroll record already exists for this period
      const existing = await Payroll.findOne({ employee: emp._id, periodName: period });

      if (existing) {
        calculatedData.push({
          employee: {
            _id: emp._id,
            name: emp.name,
            username: emp.username,
            disabled: emp.disabled,
            bankName: emp.bankName || '',
            bankAccountNumber: emp.bankAccountNumber || '',
          },
          payrollId: existing._id,
          dailySalary: existing.dailySalary,
          actualWorkDays: existing.actualWorkDays,
          calculatedWorkDays, // for comparison reference
          holidaysCount: existing.holidaysCount,
          bonus: existing.bonus,
          bonusNote: existing.bonusNote || '',
          overtimeHours: existing.overtimeHours || 0,
          overtimeRate: existing.overtimeRate || 20000,
          deduction: existing.deduction,
          deductionNote: existing.deductionNote || '',
          latePenaltyCount: existing.latePenaltyCount || 0,
          latePenaltyRate: existing.latePenaltyRate || 10000,
          unauthorizedAbsenceCount: existing.unauthorizedAbsenceCount || 0,
          unauthorizedAbsenceRate: existing.unauthorizedAbsenceRate || 100000,
          isPaidHolidays: existing.isPaidHolidays,
          totalSalary: existing.totalSalary,
          status: existing.status,
          paymentDate: existing.paymentDate,
          note: existing.note,
          isSaved: true,
        });
      } else {
        // Initial setup for new payroll draft
        const baseWorkDays = calculatedWorkDays;
        const baseHolidays = config.monthlyHolidays;
        const dailySalaryRate = config.dailySalary;
        
        // Gaji Total = Hari Kerja * Gaji Harian
        const totalSalary = baseWorkDays * dailySalaryRate;

        calculatedData.push({
          employee: {
            _id: emp._id,
            name: emp.name,
            username: emp.username,
            disabled: emp.disabled,
            bankName: emp.bankName || '',
            bankAccountNumber: emp.bankAccountNumber || '',
          },
          payrollId: null,
          dailySalary: dailySalaryRate,
          actualWorkDays: baseWorkDays,
          calculatedWorkDays,
          holidaysCount: baseHolidays,
          bonus: 0,
          bonusNote: '',
          overtimeHours: 0,
          overtimeRate: 20000,
          deduction: 0,
          deductionNote: '',
          latePenaltyCount: 0,
          latePenaltyRate: 10000,
          unauthorizedAbsenceCount: 0,
          unauthorizedAbsenceRate: 100000,
          isPaidHolidays: false,
          totalSalary,
          status: 'draft',
          paymentDate: null,
          note: '',
          isSaved: false,
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        period,
        startDate,
        endDate,
        cutoffDay: config.cutoffDay,
        payrolls: calculatedData,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all saved payroll records, with optional period filter
// @route   GET /api/salaries
export const getPayrolls = async (req, res) => {
  try {
    const { period } = req.query; // format: YYYY-MM
    const filter = {};
    if (period) {
      filter.periodName = period;
    }

    const payrolls = await Payroll.find(filter)
      .populate('employee', 'name username disabled bankName bankAccountNumber')
      .sort('-createdAt');

    res.status(200).json({ success: true, data: payrolls });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Save or update payroll record
// @route   POST /api/salaries
export const savePayroll = async (req, res) => {
  try {
    const {
      employee,
      periodName,
      startDate,
      endDate,
      dailySalary,
      actualWorkDays,
      holidaysCount,
      bonus,
      bonusNote,
      overtimeHours,
      overtimeRate,
      deduction,
      deductionNote,
      latePenaltyCount,
      latePenaltyRate,
      unauthorizedAbsenceCount,
      unauthorizedAbsenceRate,
      totalSalary,
      isPaidHolidays,
      status,
      note,
    } = req.body;

    if (!employee || !periodName || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Missing required payroll fields' });
    }

    const paymentDate = status === 'paid' ? new Date() : null;

    // Upsert payroll record by employee and periodName
    const payroll = await Payroll.findOneAndUpdate(
      { employee, periodName },
      {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        dailySalary: Number(dailySalary) || 0,
        actualWorkDays: Number(actualWorkDays) || 0,
        holidaysCount: Number(holidaysCount) || 0,
        bonus: Number(bonus) || 0,
        bonusNote: bonusNote || '',
        overtimeHours: Number(overtimeHours) || 0,
        overtimeRate: Number(overtimeRate) || 20000,
        deduction: Number(deduction) || 0,
        deductionNote: deductionNote || '',
        latePenaltyCount: Number(latePenaltyCount) || 0,
        latePenaltyRate: Number(latePenaltyRate) || 10000,
        unauthorizedAbsenceCount: Number(unauthorizedAbsenceCount) || 0,
        unauthorizedAbsenceRate: Number(unauthorizedAbsenceRate) || 100000,
        totalSalary: Number(totalSalary) || 0,
        isPaidHolidays: !!isPaidHolidays,
        status: status || 'draft',
        paymentDate,
        note: note || '',
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, data: payroll });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a payroll record
// @route   DELETE /api/salaries/:id
export const deletePayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll record not found' });
    }
    await payroll.deleteOne();
    res.status(200).json({ success: true, message: 'Payroll record deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
