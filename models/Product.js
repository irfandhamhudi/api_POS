import mongoose from 'mongoose';
import slugify from 'slugify';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    image: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      enum: ['coffee', 'tea', 'snack', 'main_course'],
      required: true,
    },
    available: {
      type: Boolean,
      default: true,
    },
    stockCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    needRestock: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

productSchema.index({ category: 1 });

productSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true }) + '-' + Date.now();
  }
  this.needRestock = this.stockCount <= 2;
  next();
});

productSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.stockCount !== undefined) {
    update.needRestock = update.stockCount <= 2;
  }
  next();
});

export default mongoose.model('Product', productSchema);
