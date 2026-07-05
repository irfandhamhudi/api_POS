import Transaction from '../models/Transaction.js';
import Product from '../models/Product.js';
import Notification from '../models/Notification.js';
import Coupon from '../models/Coupon.js';
import Shift from '../models/Shift.js';
import Table from '../models/Table.js';
import mongoose from 'mongoose';

const generateReceiptNumber = () => {
  return 'GG-' + Math.floor(10000 + Math.random() * 90000).toString();
};

const getTransactions = async (req, res) => {
  try {
    const filter = {};
    if (req.query.shift) filter.shift = req.query.shift;

    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) {
        filter.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filter.createdAt.$lte = new Date(req.query.endDate);
      }
    }

    const transactions = await Transaction.find(filter).sort('-createdAt').limit(1000).populate('items.product', 'name price image category');
    res.status(200).json({ success: true, count: transactions.length, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new transaction
// @route   POST /api/transactions
// @access  Private
const createTransaction = async (req, res) => {
  try {
    const OPEN_HOUR = process.env.OPEN_HOUR !== undefined ? parseInt(process.env.OPEN_HOUR) : 8;
    const CLOSE_HOUR = process.env.CLOSE_HOUR !== undefined ? parseInt(process.env.CLOSE_HOUR) : 21;
    const now = new Date();
    const hour = now.getHours();
    
    if (CLOSE_HOUR !== 24 && (hour < OPEN_HOUR || hour >= CLOSE_HOUR)) {
      return res.status(400).json({ success: false, message: `Orders can only be placed between ${OPEN_HOUR}:00 and ${CLOSE_HOUR}:00` });
    }

    const { items, orderType, customerName, tableNumber, paymentMethod, amountPaid, change, couponCode, discount, shiftId } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No order items' });
    }

    const productIds = items.map(i => i.product);
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = {};
    products.forEach(p => { productMap[p._id.toString()] = p; });

    let subtotal = 0;
    const bulkOps = [];
    const lowStockNotifications = [];
    const notifItems = [];

    for (const item of items) {
      const product = productMap[item.product];
      if (!product) {
        return res.status(404).json({ success: false, message: `Product not found: ${item.product}` });
      }
      if (product.stockCount < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }

      const sizePriceModifier = item.size === 'small' ? -2000 : item.size === 'large' ? 5000 : 0;
      subtotal += (product.price + sizePriceModifier) * item.quantity;

      const newStock = product.stockCount - item.quantity;
      bulkOps.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $set: { stockCount: newStock, needRestock: newStock <= 2 } }
        }
      });

      if (newStock <= 0) {
        lowStockNotifications.push({ title: 'Out of Stock Alert', message: `Item ${product.name} is out of stock.`, type: 'warning' });
      } else if (newStock <= 3) {
        lowStockNotifications.push({ title: 'Low Stock Warning', message: `Item ${product.name} has only ${newStock} left.`, type: 'warning' });
      }

      notifItems.push({ name: product.name, quantity: item.quantity, price: product.price, image: product.image });
    }

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps);
    }

    const tax = Math.round(subtotal * 0.1);
    const discountAmount = discount || 0;
    const total = subtotal + tax - discountAmount;
    const receiptNumber = generateReceiptNumber();

    // Calculate points earned (1 per Rp 10.000)
    const pointsEarned = Math.floor(total / 10000);

    const transaction = await Transaction.create({
      receiptNumber, items, subtotal, tax, total, orderType,
      customerName: customerName || 'Walk-in Customer',
      tableNumber: orderType === 'dine_in' ? tableNumber : 'N/A',
      paymentMethod, amountPaid, change,
      couponCode: couponCode || '',
      discount: discountAmount,
      status: 'completed',
      cashier: req.user._id,
      shift: shiftId || null,
      pointsEarned,
    });

    const notificationsToCreate = [...lowStockNotifications, {
      title: customerName || 'Walk-in Customer',
      message: `Ordered ${items.reduce((sum, item) => sum + item.quantity, 0)} meals`,
      type: 'order',
      receiptNumber,
      orderType,
      items: notifItems
    }];

    if (notificationsToCreate.length > 0) {
      await Notification.insertMany(notificationsToCreate);
    }

    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (coupon) {
        coupon.usedCount += 1;
        await coupon.save();
      }
    }

    // Update shift totals
    if (shiftId) {
      const shift = await Shift.findById(shiftId);
      if (shift && shift.status === 'active') {
        shift.totalSales += total;
        shift.totalOrders += 1;
        if (paymentMethod === 'cash') shift.totalCash += amountPaid;
        else if (paymentMethod === 'card') shift.totalCard += total;
        else if (paymentMethod === 'qris') shift.totalQris += total;
        await shift.save();
      }
    }

    // Mark table as occupied for dine-in orders
    if (orderType === 'dine_in' && tableNumber) {
      await Table.findOneAndUpdate(
        { label: tableNumber.split(' - ')[0].trim() },
        { status: 'occupied', currentOrder: transaction._id }
      );
    }

    const populatedTx = await Transaction.findById(transaction._id).populate('items.product', 'name price image category');
    res.status(201).json({ success: true, data: populatedTx });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Cancel transaction (void)
// @route   PUT /api/transactions/:id/cancel
// @access  Private/Admin
const cancelTransaction = async (req, res) => {
  try {
    const { cancelReason } = req.body;
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Transaction already cancelled' });
    }

    const wasCompleted = transaction.status === 'completed';

    transaction.status = 'cancelled';
    transaction.cancelReason = cancelReason || '';
    await transaction.save();

    if (wasCompleted) {
      // Restore stock for each item
      for (const item of transaction.items) {
        const product = await Product.findById(item.product);
        if (product) {
          product.stockCount += item.quantity;
          product.needRestock = product.stockCount <= 2;
          await product.save();
        }
      }
    }

    await Notification.create({
      title: transaction.customerName,
      message: `Cancelled the order ${transaction.receiptNumber}. Items returned to stock.`,
      type: 'cancel',
      receiptNumber: transaction.receiptNumber,
      orderType: transaction.orderType,
    });

    // Free the table for cancelled dine-in orders
    if (transaction.orderType === 'dine_in' && transaction.tableNumber) {
      await Table.findOneAndUpdate(
        { label: transaction.tableNumber.split(' - ')[0].trim() },
        { status: 'available', currentOrder: null }
      );
    }

    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete transaction
// @route   DELETE /api/transactions/:id
// @access  Private/Admin
const deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.status === 'completed') {
      for (const item of transaction.items) {
        const product = await Product.findById(item.product);
        if (product) {
          product.stockCount += item.quantity;
          product.needRestock = product.stockCount <= 2;
          await product.save();
        }
      }
    }

    // Free the table for deleted dine-in orders
    if (transaction.orderType === 'dine_in' && transaction.tableNumber) {
      await Table.findOneAndUpdate(
        { label: transaction.tableNumber.split(' - ')[0].trim() },
        { status: 'available', currentOrder: null }
      );
    }

    await transaction.deleteOne();
    res.status(200).json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get transaction status by receipt number
// @route   GET /api/transactions/public/status/:receiptNumber
// @access  Public
const getTransactionByReceipt = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ receiptNumber: req.params.receiptNumber.toUpperCase() })
      .populate('items.product', 'name price image category');
    
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create public transaction (self-ordering)
// @route   POST /api/transactions/public
// @access  Public
const createPublicTransaction = async (req, res) => {
  try {
    const OPEN_HOUR = process.env.OPEN_HOUR !== undefined ? parseInt(process.env.OPEN_HOUR) : 8;
    const CLOSE_HOUR = process.env.CLOSE_HOUR !== undefined ? parseInt(process.env.CLOSE_HOUR) : 21;
    const now = new Date();
    const hour = now.getHours();
    
    if (CLOSE_HOUR !== 24 && (hour < OPEN_HOUR || hour >= CLOSE_HOUR)) {
      return res.status(400).json({ success: false, message: `Orders can only be placed between ${OPEN_HOUR}:00 and ${CLOSE_HOUR}:00` });
    }

    const { items, orderType, customerName, tableNumber, paymentMethod, couponCode, discount } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No order items' });
    }

    const productIds = items.map(i => i.product);
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = {};
    products.forEach(p => { productMap[p._id.toString()] = p; });

    let subtotal = 0;
    const bulkOps = [];
    const lowStockNotifications = [];
    const notifItems = [];

    for (const item of items) {
      const product = productMap[item.product];
      if (!product) {
        return res.status(404).json({ success: false, message: `Product not found: ${item.product}` });
      }
      if (product.stockCount < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }

      const sizePriceModifier = 0;
      subtotal += product.price * item.quantity;

      const newStock = product.stockCount - item.quantity;
      bulkOps.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $set: { stockCount: newStock, needRestock: newStock <= 2 } }
        }
      });

      if (newStock <= 0) {
        lowStockNotifications.push({ title: 'Out of Stock Alert', message: `Item ${product.name} is out of stock.`, type: 'warning' });
      } else if (newStock <= 3) {
        lowStockNotifications.push({ title: 'Low Stock Warning', message: `Item ${product.name} has only ${newStock} left.`, type: 'warning' });
      }

      notifItems.push({ name: product.name, quantity: item.quantity, price: product.price, image: product.image });
    }

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps);
    }

    const tax = Math.round(subtotal * 0.1);
    const discountAmount = discount || 0;
    const total = subtotal + tax - discountAmount;
    const receiptNumber = generateReceiptNumber();

    const activeShift = await Shift.findOne({ status: 'active' });
    if (!activeShift) {
      return res.status(400).json({ success: false, message: 'Restoran sedang tutup (Jam operasional belum dimulai/tidak ada shift aktif).' });
    }

    const transaction = await Transaction.create({
      receiptNumber, items, subtotal, tax, total, orderType,
      customerName: customerName || 'Guest Customer',
      tableNumber: orderType === 'dine_in' ? tableNumber : 'N/A',
      paymentMethod: paymentMethod || 'cash',
      amountPaid: 0,
      change: 0,
      couponCode: couponCode || '',
      discount: discountAmount,
      status: 'pending',
      kitchenStatus: 'pending',
      cashier: null,
      shift: activeShift ? activeShift._id : null,
      pointsEarned: 0,
    });

    const notificationsToCreate = [...lowStockNotifications, {
      title: customerName || 'Guest Customer',
      message: `Ordered ${items.reduce((sum, item) => sum + item.quantity, 0)} items (Self-Order Cash)`,
      type: 'order',
      receiptNumber,
      orderType,
      items: notifItems
    }];

    await Notification.insertMany(notificationsToCreate);

    // Mark table as occupied for dine-in orders
    if (orderType === 'dine_in' && tableNumber) {
      await Table.findOneAndUpdate(
        { label: tableNumber.split(' - ')[0].trim() },
        { status: 'occupied', currentOrder: transaction._id }
      );
    }

    const populatedTx = await Transaction.findById(transaction._id).populate('items.product', 'name price image category');
    res.status(201).json({ success: true, data: populatedTx });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Approve a pending cash self-order (POS cashier confirmation)
// @route   PUT /api/transactions/:id/approve
// @access  Private
const approvePendingTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Transaction is not pending' });
    }
    if (transaction.paymentMethod !== 'cash') {
      return res.status(400).json({ success: false, message: 'Only cash transactions can be approved this way' });
    }

    transaction.status = 'completed';
    transaction.amountPaid = transaction.total;
    transaction.change = 0;
    transaction.cashier = req.user._id;
    await transaction.save();

    // Update shift totals
    if (transaction.shift) {
      const shift = await Shift.findById(transaction.shift);
      if (shift && shift.status === 'active') {
        shift.totalSales += transaction.total;
        shift.totalOrders += 1;
        shift.totalCash += transaction.total;
        await shift.save();
      }
    }

    const populated = await Transaction.findById(transaction._id).populate('items.product', 'name price image category');
    res.status(200).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { getTransactions, createTransaction, cancelTransaction, deleteTransaction, getTransactionByReceipt, createPublicTransaction, approvePendingTransaction };
