import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema(
  {
    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'closed'],
      default: 'active',
    },
    startingCash: {
      type: Number,
      default: 0,
    },
    endingCash: {
      type: Number,
      default: null,
    },
    totalSales: {
      type: Number,
      default: 0,
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    totalCash: {
      type: Number,
      default: 0,
    },
    totalCard: {
      type: Number,
      default: 0,
    },
    totalQris: {
      type: Number,
      default: 0,
    },
    difference: {
      type: Number,
      default: 0,
    },
    cashouts: [{
      amount: { type: Number, required: true },
      description: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

shiftSchema.index({ cashier: 1, status: 1 });
shiftSchema.index({ createdAt: -1 });

export default mongoose.model('Shift', shiftSchema);
