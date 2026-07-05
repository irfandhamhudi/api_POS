import express from 'express';
const router = express.Router();
import { getTables, getTable, createTable, updateTable, deleteTable, updateTableStatus, updateTablePositions, seedTables } from '../controllers/tableController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

router.route('/')
  .get(protect, getTables)
  .post(protect, admin, createTable);

router.post('/seed', protect, admin, seedTables);
router.put('/positions', protect, admin, updateTablePositions);

router.route('/:id')
  .get(protect, getTable)
  .put(protect, admin, updateTable)
  .delete(protect, admin, deleteTable);

router.put('/:id/status', protect, updateTableStatus);

export default router;
