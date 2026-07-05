import Coupon from '../models/Coupon.js';
import Product from '../models/Product.js';

// @desc    Get all coupons
// @route   GET /api/coupons
// @access  Private/Admin
const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({}).sort('-createdAt')
      .populate('targetProducts', 'name price image category')
      .populate('freeProducts.product', 'name price image category');
    res.status(200).json({ success: true, count: coupons.length, data: coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create coupon
// @route   POST /api/coupons
// @access  Private/Admin
const createCoupon = async (req, res) => {
  try {
    const existing = await Coupon.findOne({ code: req.body.code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }
    const coupon = await Coupon.create(req.body);
    const populated = await Coupon.findById(coupon._id)
      .populate('targetProducts', 'name price image category')
      .populate('freeProducts.product', 'name price image category');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update coupon
// @route   PUT /api/coupons/:id
// @access  Private/Admin
const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    if (req.body.code && req.body.code.toUpperCase() !== coupon.code) {
      const existing = await Coupon.findOne({ code: req.body.code.toUpperCase() });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Coupon code already exists' });
      }
    }
    const updated = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('targetProducts', 'name price image category')
      .populate('freeProducts.product', 'name price image category');
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete coupon
// @route   DELETE /api/coupons/:id
// @access  Private/Admin
const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    await coupon.deleteOne();
    res.status(200).json({ success: true, message: 'Coupon removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Validate coupon at checkout
// @route   POST /api/coupons/validate
// @access  Private
const validateCoupon = async (req, res) => {
  try {
    const { code, subtotal, cartItems } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), active: true })
      .populate('targetProducts', 'name price image category')
      .populate('freeProducts.product', 'name price image category');
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid coupon code' });
    }

    if (new Date() > coupon.expiryDate) {
      return res.status(400).json({ success: false, message: 'Coupon has expired' });
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    }

    if (subtotal < coupon.minOrder) {
      return res.status(400).json({ success: false, message: `Minimum order amount is Rp ${coupon.minOrder.toLocaleString()}` });
    }

    let discount = 0;
    let freeItems = [];
    let promotionDetails = {};

    switch (coupon.promotionType) {
      case 'bogo': {
        // Buy X Get Y free
        if (cartItems && coupon.targetProducts.length > 0) {
          const targetIds = coupon.targetProducts.map(p => p._id.toString());
          let totalMatching = 0;

          for (const item of cartItems) {
            if (targetIds.includes(item.product)) {
              totalMatching += item.quantity;
            }
          }

          const sets = Math.floor(totalMatching / coupon.buyQuantity);
          const freeCount = sets * coupon.getQuantity;

          if (sets > 0) {
            const cheapestProduct = coupon.targetProducts.reduce((min, p) =>
              p.price < min.price ? p : min, coupon.targetProducts[0]);
            discount = cheapestProduct.price * freeCount;
            promotionDetails = {
              promotionType: 'bogo',
              buyQuantity: coupon.buyQuantity,
              getQuantity: coupon.getQuantity,
              sets,
              freeCount,
              message: `Buy ${coupon.buyQuantity} Get ${coupon.getQuantity} Free - ${sets} set(s) applied`,
            };
          } else {
            return res.status(400).json({ success: false, message: `Add ${coupon.buyQuantity} eligible items to use this promotion` });
          }
        }
        break;
      }

      case 'free_item': {
        // Free item with minimum spend
        if (subtotal >= coupon.minOrder && coupon.freeProducts.length > 0) {
          freeItems = coupon.freeProducts.map(fp => ({
            product: fp.product,
            quantity: fp.quantity,
          }));

          let freeTotal = 0;
          for (const fp of coupon.freeProducts) {
            if (fp.product) {
              freeTotal += fp.product.price * fp.quantity;
            }
          }
          discount = freeTotal;
          promotionDetails = {
            promotionType: 'free_item',
            freeProducts: coupon.freeProducts.map(fp => ({
              name: fp.product?.name || 'Unknown',
              quantity: fp.quantity,
              price: fp.product?.price || 0,
            })),
            message: `Free item(s) added to your order!`,
          };
        } else if (subtotal < coupon.minOrder) {
          return res.status(400).json({ success: false, message: `Minimum order amount is Rp ${coupon.minOrder.toLocaleString()}` });
        }
        break;
      }

      case 'bundle': {
        // Bundle discount: buy target items together for a fixed discount
        if (cartItems && coupon.targetProducts.length > 0) {
          const targetIds = coupon.targetProducts.map(p => p._id.toString());
          let allPresent = true;

          for (const target of coupon.targetProducts) {
            const found = cartItems.find(item => item.product === target._id.toString());
            if (!found) {
              allPresent = false;
              break;
            }
          }

          if (allPresent) {
            if (coupon.type === 'percentage') {
              discount = Math.round(subtotal * coupon.value / 100);
            } else {
              discount = Math.min(coupon.value, subtotal);
            }
            if (coupon.maxDiscount > 0) {
              discount = Math.min(discount, coupon.maxDiscount);
            }
            promotionDetails = {
              promotionType: 'bundle',
              message: `Bundle discount applied!`,
            };
          } else {
            return res.status(400).json({ success: false, message: 'Add all bundle items to use this promotion' });
          }
        }
        break;
      }

      case 'buy_x_get_y': {
        // Buy X of specific products, get Y of same/different products at discount
        if (cartItems && coupon.targetProducts.length > 0) {
          const targetIds = coupon.targetProducts.map(p => p._id.toString());
          let totalMatching = 0;

          for (const item of cartItems) {
            if (targetIds.includes(item.product)) {
              totalMatching += item.quantity;
            }
          }

          const sets = Math.floor(totalMatching / coupon.buyQuantity);
          if (sets > 0) {
            if (coupon.type === 'percentage') {
              const freeProductPrice = coupon.freeProducts[0]?.product?.price || 0;
              discount = Math.round(freeProductPrice * sets * coupon.getQuantity * coupon.value / 100);
            } else {
              discount = coupon.value * sets;
            }
            promotionDetails = {
              promotionType: 'buy_x_get_y',
              sets,
              message: `Buy ${coupon.buyQuantity} Get ${coupon.getQuantity} at ${coupon.value}${coupon.type === 'percentage' ? '%' : 'Rp'} off!`,
            };
          } else {
            return res.status(400).json({ success: false, message: `Add ${coupon.buyQuantity} eligible items to use this promotion` });
          }
        }
        break;
      }

      default: {
        // Standard coupon (percentage or fixed)
        if (coupon.type === 'percentage') {
          discount = Math.round(subtotal * coupon.value / 100);
          if (coupon.maxDiscount > 0) {
            discount = Math.min(discount, coupon.maxDiscount);
          }
        } else {
          discount = Math.min(coupon.value, subtotal);
        }
        promotionDetails = {
          promotionType: 'coupon',
          message: coupon.type === 'percentage' ? `${coupon.value}% off` : `Rp ${coupon.value.toLocaleString()} off`,
        };
        break;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount,
        description: coupon.description,
        promotionType: coupon.promotionType,
        promotionDetails,
        freeItems,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get active promotions for POS auto-apply
// @route   GET /api/coupons/active-promotions
// @access  Private
const getActivePromotions = async (req, res) => {
  try {
    const now = new Date();
    const promotions = await Coupon.find({
      active: true,
      expiryDate: { $gt: now },
      promotionType: { $ne: 'coupon' },
      $or: [
        { usageLimit: 0 },
        { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
      ],
    })
      .populate('targetProducts', 'name price image category')
      .populate('freeProducts.product', 'name price image category')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: promotions.length, data: promotions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Increment coupon usage
// @route   POST /api/coupons/:id/use
// @access  Private
const useCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }
    coupon.usedCount += 1;
    await coupon.save();
    res.status(200).json({ success: true, data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { getCoupons, createCoupon, updateCoupon, deleteCoupon, validateCoupon, getActivePromotions, useCoupon };
