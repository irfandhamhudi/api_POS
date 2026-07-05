import Transaction from '../models/Transaction.js';

// @desc    Get all orders for kitchen (paid transactions with kitchenStatus pending, preparing, or ready)
// @route   GET /api/kitchen/orders
// @access  Private (Admin/Kitchen/Cashier)
const getKitchenOrders = async (req, res) => {
  try {
    const orders = await Transaction.find({
      kitchenStatus: { $in: ['pending', 'preparing', 'ready'] }
    })
    .sort('createdAt') // FIFO (First In, First Out)
    .populate('items.product', 'name price image category');

    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update kitchen status of a transaction
// @route   PUT /api/kitchen/orders/:id/status
// @access  Private (Admin/Kitchen/Cashier)
const updateKitchenStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['pending', 'preparing', 'ready', 'served'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid kitchen status' });
    }

    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    transaction.kitchenStatus = status;
    await transaction.save();

    const populatedTx = await Transaction.findById(transaction._id).populate('items.product', 'name price image category');

    res.status(200).json({ success: true, data: populatedTx });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { getKitchenOrders, updateKitchenStatus };
