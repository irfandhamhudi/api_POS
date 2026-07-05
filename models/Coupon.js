import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    promotionType: {
      type: String,
      enum: ['coupon', 'bogo', 'free_item', 'bundle', 'buy_x_get_y'],
      default: 'coupon',
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    minOrder: {
      type: Number,
      default: 0,
    },
    maxDiscount: {
      type: Number,
      default: 0,
    },
    usageLimit: {
      type: Number,
      default: 0,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    // BOGO: Buy X Get Y
    buyQuantity: {
      type: Number,
      default: 0,
    },
    getQuantity: {
      type: Number,
      default: 0,
    },
    // Target products for BOGO / free item / bundle
    targetProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    }],
    // Free item products
    freeProducts: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
      quantity: {
        type: Number,
        default: 1,
      },
    }],
    // Minimum items required for promotion
    minItems: {
      type: Number,
      default: 0,
    },
    // Applicable categories (empty = all)
    applicableCategories: [{
      type: String,
    }],
    // Stackable with other coupons
    stackable: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1 });
couponSchema.index({ active: 1 });
couponSchema.index({ promotionType: 1 });

export default mongoose.model('Coupon', couponSchema);
