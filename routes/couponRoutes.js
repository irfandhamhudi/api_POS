import express from 'express';
const router = express.Router();
import { getCoupons, createCoupon, updateCoupon, deleteCoupon, validateCoupon, getActivePromotions, useCoupon } from '../controllers/couponController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

router.route('/')
  .get(protect, admin, getCoupons)
  .post(protect, admin, createCoupon);

router.post('/validate', protect, validateCoupon);
router.get('/active-promotions', protect, getActivePromotions);

router.route('/:id')
  .put(protect, admin, updateCoupon)
  .delete(protect, admin, deleteCoupon);

router.post('/:id/use', protect, useCoupon);

export default router;
