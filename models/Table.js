import mongoose from 'mongoose';

const tableSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      default: 4,
    },
    zone: {
      type: String,
      enum: ['indoor', 'outdoor', 'rooftop', 'vip'],
      default: 'indoor',
    },
    status: {
      type: String,
      enum: ['available', 'occupied', 'reserved', 'maintenance'],
      default: 'available',
    },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    shape: {
      type: String,
      enum: ['square', 'round', 'rectangle'],
      default: 'square',
    },
    currentOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

tableSchema.index({ status: 1 });
tableSchema.index({ zone: 1 });

export default mongoose.model('Table', tableSchema);
