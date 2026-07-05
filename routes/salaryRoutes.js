import express from 'express';
const router = express.Router();
import {
  getSalaryConfig,
  updateSalaryConfig,
  calculatePayroll,
  getPayrolls,
  savePayroll,
  deletePayroll
} from '../controllers/salaryController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

router.get('/config', protect, admin, getSalaryConfig);
router.post('/config', protect, admin, updateSalaryConfig);
router.get('/calculate', protect, admin, calculatePayroll);
router.get('/', protect, admin, getPayrolls);
router.post('/', protect, admin, savePayroll);
router.delete('/:id', protect, admin, deletePayroll);

export default router;
