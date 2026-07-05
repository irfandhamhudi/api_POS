import midtransClient from 'midtrans-client';
import Transaction from '../models/Transaction.js';
import Product from '../models/Product.js';
import Notification from '../models/Notification.js';
import Coupon from '../models/Coupon.js';
import Shift from '../models/Shift.js';

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

const generateReceiptNumber = () => {
  return 'GG-' + Math.floor(10000 + Math.random() * 90000).toString();
};

// @desc    Create Midtrans Snap token for card/qris payment
// @route   POST /api/payments/snap
// @access  Private
const createSnapToken = async (req, res) => {
  try {
    const { items, orderType, customerName, tableNumber, couponCode, discount, shiftId } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No order items' });
    }

    const productIds = items.map(i => i.product);
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = {};
    products.forEach(p => { productMap[p._id.toString()] = p; });

    let subtotal = 0;
    const itemDetails = [];

    for (const item of items) {
      const product = productMap[item.product];
      if (!product) {
        return res.status(404).json({ success: false, message: `Product not found: ${item.product}` });
      }
      if (product.stockCount < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }

      const sizePriceModifier = item.size === 'small' ? -2000 : item.size === 'large' ? 5000 : 0;
      const itemPrice = product.price + sizePriceModifier;
      subtotal += itemPrice * item.quantity;

      itemDetails.push({
        id: product._id.toString(),
        name: `${product.name} (${item.size})`,
        price: itemPrice,
        quantity: item.quantity,
      });
    }

    const tax = Math.round(subtotal * 0.1);
    const discountAmount = discount || 0;
    const total = subtotal + tax - discountAmount;
    const receiptNumber = generateReceiptNumber();
    const orderId = `GG-${receiptNumber}-${Date.now()}`;

    if (discountAmount > 0) {
      itemDetails.push({
        id: 'discount',
        name: 'Diskon',
        price: -discountAmount,
        quantity: 1,
      });
    }

    itemDetails.push({
      id: 'tax',
      name: 'Pajak (10%)',
      price: tax,
      quantity: 1,
    });

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: total,
      },
      item_details: itemDetails,
      customer_details: {
        first_name: customerName || 'Walk-in Customer',
      },
      callbacks: {
        finish: `${process.env.CLIENT_URL}/pos`,
      },
    };

    const transaction = await snap.createTransaction(parameter);

    // Store pending transaction metadata
    await Transaction.create({
      receiptNumber,
      items: items.map(i => ({
        product: i.product,
        quantity: i.quantity,
        size: i.size,
        notes: i.notes || '',
      })),
      subtotal,
      tax,
      total,
      orderType,
      customerName: customerName || 'Walk-in Customer',
      tableNumber: orderType === 'dine_in' ? tableNumber : 'N/A',
      paymentMethod: 'card',
      amountPaid: total,
      change: 0,
      couponCode: couponCode || '',
      discount: discountAmount,
      status: 'pending',
      cashier: req.user ? req.user._id : null,
      shift: shiftId || (await Shift.findOne({ status: 'active' }).then(s => s ? s._id : null)),
      midtransOrderId: orderId,
      midtransToken: transaction.token,
      pointsEarned: Math.floor(total / 10000),
    });

    res.status(201).json({
      success: true,
      data: {
        token: transaction.token,
        redirect_url: transaction.redirect_url,
        orderId,
        receiptNumber,
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Midtrans notification callback
// @route   POST /api/payments/notification
// @access  Public
const handleNotification = async (req, res) => {
  try {
    const notification = req.body;
    const statusResponse = await snap.transaction(notification.order_id);

    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    const tx = await Transaction.findOne({ midtransOrderId: orderId });
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    let newStatus = 'completed';

    if (transactionStatus === 'capture') {
      if (fraudStatus === 'accept') {
        newStatus = 'completed';
      } else if (fraudStatus === 'challenge') {
        newStatus = 'pending';
      } else {
        newStatus = 'cancelled';
      }
    } else if (transactionStatus === 'settlement') {
      newStatus = 'completed';
    } else if (transactionStatus === 'pending') {
      newStatus = 'pending';
    } else if (transactionStatus === 'deny' || transactionStatus === 'cancel' || transactionStatus === 'expire') {
      newStatus = 'cancelled';
    }

    const wasCompleted = tx.status === 'completed';
    tx.status = newStatus;
    await tx.save();

    if (newStatus === 'completed' && !wasCompleted) {
      // Deduct stock
      for (const item of tx.items) {
        const product = await Product.findById(item.product);
        if (product) {
          product.stockCount -= item.quantity;
          product.needRestock = product.stockCount <= 2;
          await product.save();
        }
      }

      // Check if notification already exists for this receipt
      const existingNotif = await Notification.findOne({ receiptNumber: tx.receiptNumber, type: 'order' });
      if (!existingNotif) {
        // Create notifications
        const lowStockNotifications = [];
        for (const item of tx.items) {
          const product = await Product.findById(item.product);
          if (product) {
            if (product.stockCount <= 0) {
              lowStockNotifications.push({ title: 'Out of Stock Alert', message: `Item ${product.name} is out of stock.`, type: 'warning', source: 'all' });
            } else if (product.stockCount <= 3) {
              lowStockNotifications.push({ title: 'Low Stock Warning', message: `Item ${product.name} has only ${product.stockCount} left.`, type: 'warning', source: 'all' });
            }
          }
        }

        const notifItems = [];
        for (const i of tx.items) {
          const p = await Product.findById(i.product);
          notifItems.push({ name: p?.name || 'Unknown', quantity: i.quantity, price: p?.price || 0, image: p?.image || '' });
        }

        await Notification.insertMany([...lowStockNotifications, {
          title: tx.customerName || 'Walk-in Customer',
          message: `Ordered ${tx.items.reduce((sum, i) => sum + i.quantity, 0)} items (QRIS Payment)`,
          type: 'order',
          receiptNumber: tx.receiptNumber,
          orderType: tx.orderType,
          source: 'all',
          items: notifItems,
        }]);
      }

      // Update coupon usage
      if (tx.couponCode) {
        const coupon = await Coupon.findOne({ code: tx.couponCode.toUpperCase() });
        if (coupon) {
          coupon.usedCount += 1;
          await coupon.save();
        }
      }

      // Update shift
      if (tx.shift) {
        const shift = await Shift.findById(tx.shift);
        if (shift && shift.status === 'active') {
          shift.totalSales += tx.total;
          shift.totalOrders += 1;
          if (tx.paymentMethod === 'card') shift.totalCard += tx.total;
          else if (tx.paymentMethod === 'qris') shift.totalQris += tx.total;
          await shift.save();
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create Qris payment
// @route   POST /api/payments/qris
// @access  Private
const createQrisPayment = async (req, res) => {
  try {
    const { items, orderType, customerName, tableNumber, couponCode, discount, shiftId } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No order items' });
    }

    const productIds = items.map(i => i.product);
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = {};
    products.forEach(p => { productMap[p._id.toString()] = p; });

    let subtotal = 0;
    const itemDetails = [];

    for (const item of items) {
      const product = productMap[item.product];
      if (!product) {
        return res.status(404).json({ success: false, message: `Product not found: ${item.product}` });
      }
      if (product.stockCount < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }

      const sizePriceModifier = item.size === 'small' ? -2000 : item.size === 'large' ? 5000 : 0;
      const itemPrice = product.price + sizePriceModifier;
      subtotal += itemPrice * item.quantity;

      itemDetails.push({
        id: product._id.toString(),
        name: `${product.name} (${item.size})`,
        price: itemPrice,
        quantity: item.quantity,
      });
    }

    const tax = Math.round(subtotal * 0.1);
    const discountAmount = discount || 0;
    const total = subtotal + tax - discountAmount;
    const receiptNumber = generateReceiptNumber();
    const orderId = `GG-${receiptNumber}-${Date.now()}`;

    if (discountAmount > 0) {
      itemDetails.push({
        id: 'discount',
        name: 'Diskon',
        price: -discountAmount,
        quantity: 1,
      });
    }

    itemDetails.push({
      id: 'tax',
      name: 'Pajak (10%)',
      price: tax,
      quantity: 1,
    });

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: total,
      },
      item_details: itemDetails,
      customer_details: {
        first_name: customerName || 'Walk-in Customer',
      },
      payment_type: 'qris',
      callbacks: {
        finish: `${process.env.CLIENT_URL}/pos`,
      },
    };

    const transaction = await snap.createTransaction(parameter);

    await Transaction.create({
      receiptNumber,
      items: items.map(i => ({
        product: i.product,
        quantity: i.quantity,
        size: i.size,
        notes: i.notes || '',
      })),
      subtotal,
      tax,
      total,
      orderType,
      customerName: customerName || 'Walk-in Customer',
      tableNumber: orderType === 'dine_in' ? tableNumber : 'N/A',
      paymentMethod: 'qris',
      amountPaid: total,
      change: 0,
      couponCode: couponCode || '',
      discount: discountAmount,
      status: 'pending',
      cashier: req.user ? req.user._id : null,
      shift: shiftId || (await Shift.findOne({ status: 'active' }).then(s => s ? s._id : null)),
      midtransOrderId: orderId,
      midtransToken: transaction.token,
      pointsEarned: Math.floor(total / 10000),
    });

    res.status(201).json({
      success: true,
      data: {
        token: transaction.token,
        redirect_url: transaction.redirect_url,
        qrString: transaction.qr_string,
        orderId,
        receiptNumber,
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Check Midtrans transaction status
// @route   GET /api/payments/status/:orderId
// @access  Private
const checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const statusResponse = await snap.transaction(orderId);

    const tx = await Transaction.findOne({ midtransOrderId: orderId });

    // Process status update locally (in case webhook didn't reach server)
    if (tx) {
      let newStatus = 'completed';
      const transactionStatus = statusResponse.transaction_status;
      const fraudStatus = statusResponse.fraud_status;

      if (transactionStatus === 'capture') {
        if (fraudStatus === 'accept') newStatus = 'completed';
        else if (fraudStatus === 'challenge') newStatus = 'pending';
        else newStatus = 'cancelled';
      } else if (transactionStatus === 'settlement') {
        newStatus = 'completed';
      } else if (transactionStatus === 'pending') {
        newStatus = 'pending';
      } else if (transactionStatus === 'deny' || transactionStatus === 'cancel' || transactionStatus === 'expire') {
        newStatus = 'cancelled';
      }

      const wasCompleted = tx.status === 'completed';

      if (newStatus !== tx.status) {
        tx.status = newStatus;
        await tx.save();
      }

      // If just completed, process order fully
      if (newStatus === 'completed' && !wasCompleted) {
        // Deduct stock
        for (const item of tx.items) {
          const product = await Product.findById(item.product);
          if (product) {
            product.stockCount -= item.quantity;
            product.needRestock = product.stockCount <= 2;
            await product.save();
          }
        }

        // Create notification if not exists
        const existingNotif = await Notification.findOne({ receiptNumber: tx.receiptNumber, type: 'order' });
        if (!existingNotif) {
          const lowStockNotifications = [];
          for (const item of tx.items) {
            const product = await Product.findById(item.product);
            if (product) {
              if (product.stockCount <= 0) {
                lowStockNotifications.push({ title: 'Out of Stock Alert', message: `Item ${product.name} is out of stock.`, type: 'warning', source: 'all' });
              } else if (product.stockCount <= 3) {
                lowStockNotifications.push({ title: 'Low Stock Warning', message: `Item ${product.name} has only ${product.stockCount} left.`, type: 'warning', source: 'all' });
              }
            }
          }

          const notifItems = [];
          for (const i of tx.items) {
            const p = await Product.findById(i.product);
            notifItems.push({ name: p?.name || 'Unknown', quantity: i.quantity, price: p?.price || 0, image: p?.image || '' });
          }

          await Notification.insertMany([...lowStockNotifications, {
            title: tx.customerName || 'Walk-in Customer',
            message: `Ordered ${tx.items.reduce((sum, i) => sum + i.quantity, 0)} items (QRIS Payment)`,
            type: 'order',
            receiptNumber: tx.receiptNumber,
            orderType: tx.orderType,
            source: 'all',
            items: notifItems,
          }]);
        }

        // Update coupon usage
        if (tx.couponCode) {
          const coupon = await Coupon.findOne({ code: tx.couponCode.toUpperCase() });
          if (coupon) {
            coupon.usedCount += 1;
            await coupon.save();
          }
        }

        // Update shift
        if (tx.shift) {
          const shift = await Shift.findById(tx.shift);
          if (shift && shift.status === 'active') {
            shift.totalSales += tx.total;
            shift.totalOrders += 1;
            if (tx.paymentMethod === 'qris') shift.totalQris += tx.total;
            else if (tx.paymentMethod === 'card') shift.totalCard += tx.total;
            await shift.save();
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: statusResponse.order_id,
        transactionStatus: statusResponse.transaction_status,
        fraudStatus: statusResponse.fraud_status,
        paymentType: statusResponse.payment_type,
        transactionId: statusResponse.transaction_id,
        transactionTime: statusResponse.transaction_time,
        settlementTime: statusResponse.settlement_time,
        expiryTime: statusResponse.expiry_time,
        statusCode: statusResponse.status_code,
        statusMessage: statusResponse.status_message,
        localReceiptNumber: tx?.receiptNumber,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { createSnapToken, handleNotification, createQrisPayment, checkPaymentStatus };
