import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    size: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const transactionSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
    subtotal: {
      type: Number,
      required: true,
    },
    tax: {
      type: Number,
      required: true,
    },
    total: {
      type: Number,
      required: true,
    },
    orderType: {
      type: String,
      enum: ['dine_in', 'take_away', 'order_online'],
      required: true,
    },
    customerName: {
      type: String,
      default: 'Walk-in Customer',
    },
    tableNumber: {
      type: String,
      default: '',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'qris'],
      required: true,
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    change: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['completed', 'cancelled', 'pending'],
      default: 'completed',
    },
    kitchenStatus: {
      type: String,
      enum: ['pending', 'preparing', 'ready', 'served'],
      default: 'pending',
    },
    midtransOrderId: {
      type: String,
      default: '',
    },
    midtransToken: {
      type: String,
      default: '',
    },
    cancelReason: {
      type: String,
      default: '',
    },
    couponCode: {
      type: String,
      default: '',
    },
    discount: {
      type: Number,
      default: 0,
    },
    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
    },
    pointsEarned: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ status: 1 });

export default mongoose.model('Transaction', transactionSchema);
