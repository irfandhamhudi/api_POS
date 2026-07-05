import mongoose from 'mongoose';
import { notificationEmitter } from '../utils/events.js';

const notifItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    image: { type: String, default: '' },
  },
  { _id: false }
);

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['info', 'warning', 'success', 'cancel', 'order'],
      default: 'info',
    },
    read: {
      type: Boolean,
      default: false,
    },
    receiptNumber: {
      type: String,
      default: '',
    },
    orderType: {
      type: String,
      default: '',
    },
    source: {
      type: String,
      enum: ['pos', 'admin', 'all'],
      default: 'all',
    },
    items: [notifItemSchema],
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ read: 1 });

notificationSchema.post('save', function(doc) {
  notificationEmitter.emit('new-notification', doc);
});

notificationSchema.post('insertMany', function(docs) {
  if (Array.isArray(docs)) {
    docs.forEach(doc => {
      notificationEmitter.emit('new-notification', doc);
    });
  }
});

export default mongoose.model('Notification', notificationSchema);
