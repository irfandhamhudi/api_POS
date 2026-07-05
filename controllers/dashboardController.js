import Transaction from '../models/Transaction.js';
import Product from '../models/Product.js';
import Shift from '../models/Shift.js';

// @desc    Get dashboard statistics
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
  try {
    let startPeriod = new Date();
    startPeriod.setHours(0, 0, 0, 0);
    
    let endPeriod = new Date();
    endPeriod.setHours(23, 59, 59, 999);

    if (req.query.startDate) {
      startPeriod = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      endPeriod = new Date(req.query.endDate);
    }

    const [todayTransactions, stockByCategory, todayShifts, recentTransactions] = await Promise.all([
      Transaction.find({
        createdAt: { $gte: startPeriod, $lte: endPeriod },
        status: { $in: ['completed', 'pending'] }
      }).populate('items.product', 'category'),
      Product.aggregate([
        { $group: { _id: '$category', totalStock: { $sum: '$stockCount' } } }
      ]),
      Shift.find({ startTime: { $gte: startPeriod, $lte: endPeriod } }),
      Transaction.find({
        createdAt: { $gte: startPeriod, $lte: endPeriod }
      })
      .sort('-createdAt')
      .limit(5)
      .populate('items.product', 'name price image category')
    ]);

    const stockMap = {};
    stockByCategory.forEach(s => { stockMap[s._id] = s.totalStock; });

    const totalRevenue = todayTransactions.reduce((acc, curr) => acc + curr.total, 0);
    const todaySales = todayTransactions.length;
    const onProgress = todayTransactions.filter(t => t.orderType === 'dine_in').length;
    const avgOrder = todaySales > 0 ? totalRevenue / todaySales : 0;

    const totalCashouts = todayShifts.reduce((sum, shift) => {
      return sum + (shift.cashouts || []).reduce((s, c) => s + (c.amount || 0), 0);
    }, 0);
    const netRevenue = totalRevenue - totalCashouts;

    const hourlyData = [
      { time: '8 AM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '9 AM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '10 AM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '11 AM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '12 PM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '1 PM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '2 PM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '3 PM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '4 PM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '5 PM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '6 PM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '7 PM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '8 PM', coffee: 0, tea: 0, snack: 0, main: 0 },
      { time: '9 PM', coffee: 0, tea: 0, snack: 0, main: 0 },
    ];

    const soldByCategory = { coffee: 0, tea: 0, snack: 0, main_course: 0 };

    todayTransactions.forEach(tx => {
      const hour = new Date(tx.createdAt).getHours();
      let hourIndex = -1;
      
      if (hour >= 8 && hour <= 11) hourIndex = hour - 8;
      else if (hour === 12) hourIndex = 4;
      else if (hour >= 13 && hour <= 17) hourIndex = hour - 13 + 5;
      else if (hour >= 18 && hour <= 21) hourIndex = hour - 18 + 10;

      if (hourIndex >= 0 && hourIndex < 14) {
        tx.items.forEach(item => {
          if (item.product && item.product.category) {
            const cat = item.product.category;
            soldByCategory[cat] = (soldByCategory[cat] || 0) + item.quantity;
            if (cat === 'coffee') hourlyData[hourIndex].coffee += item.quantity;
            else if (cat === 'tea') hourlyData[hourIndex].tea += item.quantity;
            else if (cat === 'snack') hourlyData[hourIndex].snack += item.quantity;
            else if (cat === 'main_course') hourlyData[hourIndex].main += item.quantity;
          }
        });
      }
    });

    const labels = { coffee: 'Coffee', tea: 'Tea', snack: 'Snack', main_course: 'Main Course' };
    const radarData = Object.entries(labels).map(([key, label]) => ({
      category: label,
      value: Math.min(100, (soldByCategory[key] || 0) * 5 + Math.round((stockMap[key] || 0) / 2)),
      sold: soldByCategory[key] || 0,
      stock: stockMap[key] || 0
    }));

    res.status(200).json({
      success: true,
      data: {
        stats: { totalRevenue, todaySales, onProgress, avgOrder, netRevenue, totalCashouts },
        hourlyData,
        radarData,
        recentTransactions,
        transactions: todayTransactions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { getDashboardStats };
