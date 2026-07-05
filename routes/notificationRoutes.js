import express from 'express';
const router = express.Router();
import { getNotifications, createNotification, createNotificationsBatch, markAllAsRead, markAsRead, deleteNotification, deleteAllNotifications, getNotificationsStream } from '../controllers/notificationController.js';
import { protect } from '../middlewares/authMiddleware.js';

router.get('/stream', protect, getNotificationsStream);

router.route('/')
  .get(protect, getNotifications)
  .post(protect, createNotification)
  .delete(protect, deleteAllNotifications);

router.post('/batch', protect, createNotificationsBatch);

router.put('/read-all', protect, markAllAsRead);
router.put('/:id/read', protect, markAsRead);
router.delete('/:id', protect, deleteNotification);

export default router;
