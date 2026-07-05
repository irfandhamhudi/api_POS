import express from 'express';
const router = express.Router();
import { getKitchenOrders, updateKitchenStatus } from '../controllers/kitchenController.js';
import { protect } from '../middlewares/authMiddleware.js';

router.route('/orders')
  .get(getKitchenOrders);

router.route('/orders/:id/status')
  .put(updateKitchenStatus);

export default router;
