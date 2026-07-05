import Notification from '../models/Notification.js';
import { notificationEmitter } from '../utils/events.js';

// @desc    Get all notifications
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const { source } = req.query;
    const filter = {};
    if (source) {
      filter.$or = [{ source }, { source: 'all' }];
    }
    const notifications = await Notification.find(filter).sort('-createdAt').limit(50);
    res.status(200).json({ success: true, count: notifications.length, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create notification
// @route   POST /api/notifications
// @access  Private
const createNotification = async (req, res) => {
  try {
    const notification = await Notification.create(req.body);
    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create multiple notifications
// @route   POST /api/notifications/batch
// @access  Private
const createNotificationsBatch = async (req, res) => {
  try {
    const { notifications } = req.body;
    if (!notifications || notifications.length === 0) {
      return res.status(400).json({ success: false, message: 'No notifications provided' });
    }
    const created = await Notification.insertMany(notifications);
    res.status(201).json({ success: true, count: created.length, data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark all as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    const { source } = req.query;
    const filter = { read: false };
    if (source) {
      filter.$or = [{ source }, { source: 'all' }];
    }
    await Notification.updateMany(filter, { read: true });
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark one as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    notification.read = true;
    await notification.save();
    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    await notification.deleteOne();
    res.status(200).json({ success: true, message: 'Notification removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete all notifications
// @route   DELETE /api/notifications
// @access  Private
const deleteAllNotifications = async (req, res) => {
  try {
    const { source } = req.query;
    const filter = {};
    if (source) {
      filter.$or = [{ source }, { source: 'all' }];
    }
    await Notification.deleteMany(filter);
    res.status(200).json({ success: true, message: 'All notifications removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get real-time notification stream (SSE)
// @route   GET /api/notifications/stream
// @access  Private
const getNotificationsStream = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendNotif = (notif) => {
    res.write(`data: ${JSON.stringify(notif)}\n\n`);
  };

  notificationEmitter.on('new-notification', sendNotif);

  req.on('close', () => {
    notificationEmitter.off('new-notification', sendNotif);
  });
};

export { getNotifications, createNotification, createNotificationsBatch, markAllAsRead, markAsRead, deleteNotification, deleteAllNotifications, getNotificationsStream };
