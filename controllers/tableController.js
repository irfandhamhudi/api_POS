import Table from '../models/Table.js';

// @desc    Get all tables
// @route   GET /api/tables
// @access  Private
const getTables = async (req, res) => {
  try {
    const filter = {};
    if (req.query.zone) filter.zone = req.query.zone;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.active !== undefined) filter.active = req.query.active === 'true';

    const tables = await Table.find(filter).sort('name').populate('currentOrder', 'receiptNumber customerName total items');
    res.status(200).json({ success: true, count: tables.length, data: tables });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single table
// @route   GET /api/tables/:id
// @access  Private
const getTable = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id).populate('currentOrder', 'receiptNumber customerName total items');
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }
    res.status(200).json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create table
// @route   POST /api/tables
// @access  Private/Admin
const createTable = async (req, res) => {
  try {
    const existing = await Table.findOne({ name: req.body.name });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Table name already exists' });
    }
    const table = await Table.create(req.body);
    res.status(201).json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update table
// @route   PUT /api/tables/:id
// @access  Private/Admin
const updateTable = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }
    if (req.body.name && req.body.name !== table.name) {
      const existing = await Table.findOne({ name: req.body.name });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Table name already exists' });
      }
    }
    const updated = await Table.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete table
// @route   DELETE /api/tables/:id
// @access  Private/Admin
const deleteTable = async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }
    if (table.status === 'occupied') {
      return res.status(400).json({ success: false, message: 'Cannot delete an occupied table' });
    }
    await table.deleteOne();
    res.status(200).json({ success: true, message: 'Table deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update table status
// @route   PUT /api/tables/:id/status
// @access  Private
const updateTableStatus = async (req, res) => {
  try {
    const { status, orderId } = req.body;
    const table = await Table.findById(req.params.id);
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }

    table.status = status;
    if (status === 'occupied' && orderId) {
      table.currentOrder = orderId;
    } else if (status === 'available') {
      table.currentOrder = null;
    }

    await table.save();
    res.status(200).json({ success: true, data: table });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update table positions (bulk)
// @route   PUT /api/tables/positions
// @access  Private/Admin
const updateTablePositions = async (req, res) => {
  try {
    const { positions } = req.body;
    if (!positions || !Array.isArray(positions)) {
      return res.status(400).json({ success: false, message: 'Positions array required' });
    }

    const bulkOps = positions.map(p => ({
      updateOne: {
        filter: { _id: p.id },
        update: { $set: { position: { x: p.x, y: p.y } } },
      },
    }));

    await Table.bulkWrite(bulkOps);
    res.status(200).json({ success: true, message: 'Positions updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Seed default tables
// @route   POST /api/tables/seed
// @access  Private/Admin
const seedTables = async (req, res) => {
  try {
    const count = await Table.countDocuments();
    if (count > 0) {
      return res.status(400).json({ success: false, message: 'Tables already exist' });
    }

    const defaultTables = [
      { name: 'A1', label: 'A1', capacity: 2, zone: 'indoor', position: { x: 2, y: 2 }, shape: 'round' },
      { name: 'A2', label: 'A2', capacity: 2, zone: 'indoor', position: { x: 5, y: 2 }, shape: 'round' },
      { name: 'A3', label: 'A3', capacity: 4, zone: 'indoor', position: { x: 8, y: 2 }, shape: 'square' },
      { name: 'B1', label: 'B1', capacity: 4, zone: 'indoor', position: { x: 2, y: 6 }, shape: 'square' },
      { name: 'B2', label: 'B2', capacity: 4, zone: 'indoor', position: { x: 5, y: 6 }, shape: 'square' },
      { name: 'B3', label: 'B3', capacity: 6, zone: 'indoor', position: { x: 8, y: 6 }, shape: 'rectangle' },
      { name: 'C1', label: 'C1', capacity: 2, zone: 'outdoor', position: { x: 2, y: 10 }, shape: 'round' },
      { name: 'C2', label: 'C2', capacity: 4, zone: 'outdoor', position: { x: 5, y: 10 }, shape: 'square' },
      { name: 'C3', label: 'C3', capacity: 2, zone: 'rooftop', position: { x: 2, y: 14 }, shape: 'round' },
      { name: 'C4', label: 'C4', capacity: 4, zone: 'rooftop', position: { x: 5, y: 14 }, shape: 'square' },
      { name: 'VIP1', label: 'VIP 1', capacity: 8, zone: 'vip', position: { x: 2, y: 18 }, shape: 'rectangle' },
      { name: 'BAR', label: 'Bar', capacity: 1, zone: 'indoor', position: { x: 11, y: 2 }, shape: 'rectangle' },
    ];

    const tables = await Table.insertMany(defaultTables);
    res.status(201).json({ success: true, count: tables.length, data: tables });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { getTables, getTable, createTable, updateTable, deleteTable, updateTableStatus, updateTablePositions, seedTables };
