import express from 'express';
const router = express.Router();
import { loginUser, logoutUser, getMe, updateProfile, updatePassword } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, updatePassword);

export default router;
