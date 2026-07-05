import mongoose from 'mongoose';

const salaryConfigSchema = new mongoose.Schema(
  {
    dailySalary: {
      type: Number,
      required: true,
      default: 85000,
    },
    monthlyHolidays: {
      type: Number,
      required: true,
      default: 4,
    },
    cutoffDay: {
      type: Number,
      required: true,
      default: 25,
      min: 1,
      max: 31,
    },
  },
  { timestamps: true }
);

export default mongoose.model('SalaryConfig', salaryConfigSchema);
