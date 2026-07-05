import mongoose from 'mongoose';

const payrollSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    periodName: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    dailySalary: {
      type: Number,
      required: true,
      default: 85000,
    },
    actualWorkDays: {
      type: Number,
      required: true,
      default: 0,
    },
    holidaysCount: {
      type: Number,
      required: true,
      default: 4,
    },
    bonus: {
      type: Number,
      default: 0,
    },
    bonusNote: {
      type: String,
      default: '',
    },
    overtimeHours: {
      type: Number,
      default: 0,
    },
    overtimeRate: {
      type: Number,
      default: 20000,
    },
    deduction: {
      type: Number,
      default: 0,
    },
    deductionNote: {
      type: String,
      default: '',
    },
    latePenaltyCount: {
      type: Number,
      default: 0,
    },
    latePenaltyRate: {
      type: Number,
      default: 10000,
    },
    unauthorizedAbsenceCount: {
      type: Number,
      default: 0,
    },
    unauthorizedAbsenceRate: {
      type: Number,
      default: 100000,
    },
    totalSalary: {
      type: Number,
      required: true,
    },
    isPaidHolidays: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['draft', 'paid'],
      default: 'draft',
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Index to prevent duplicate payroll records for same employee in same period
payrollSchema.index({ employee: 1, periodName: 1 }, { unique: true });
payrollSchema.index({ startDate: 1, endDate: 1 });

export default mongoose.model('Payroll', payrollSchema);
