import express from 'express';
const router = express.Router();
import { getCategories } from '../controllers/categoryController.js';
import { protect } from '../middlewares/authMiddleware.js';

router.get('/public', getCategories);
router.get('/', protect, getCategories);

export default router;
