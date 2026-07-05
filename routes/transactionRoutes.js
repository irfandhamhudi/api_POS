import express from 'express';
const router = express.Router();
import { getTransactions, createTransaction, cancelTransaction, deleteTransaction, getTransactionByReceipt, createPublicTransaction, approvePendingTransaction } from '../controllers/transactionController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

router.route('/')
  .get(protect, getTransactions)
  .post(protect, createTransaction);

// Public route to track order status and create guest transactions
router.get('/public/status/:receiptNumber', getTransactionByReceipt);
router.post('/public', createPublicTransaction);

router.route('/:id')
  .delete(protect, admin, deleteTransaction);

router.put('/:id/cancel', protect, admin, cancelTransaction);
router.put('/:id/approve', protect, approvePendingTransaction);

export default router;
