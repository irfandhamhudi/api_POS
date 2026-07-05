import express from 'express';
const router = express.Router();
import { createSnapToken, handleNotification, createQrisPayment, checkPaymentStatus } from '../controllers/paymentController.js';
import { protect } from '../middlewares/authMiddleware.js';

router.post('/snap', protect, createSnapToken);
router.post('/qris', protect, createQrisPayment);
router.get('/status/:orderId', protect, checkPaymentStatus);
router.post('/notification', handleNotification);

// Public routes for guest self-ordering
router.post('/public/snap', createSnapToken);
router.post('/public/qris', createQrisPayment);
router.get('/public/status/:orderId', checkPaymentStatus);

export default router;
