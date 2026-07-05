import Category from '../models/Category.js';
import Product from '../models/Product.js';

// @desc    Get all categories with item counts and restock status
// @route   GET /api/categories
// @access  Private
const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({});

    const stats = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, needsRestock: { $max: { $lte: ['$stockCount', 2] } } } }
    ]);

    const statsMap = {};
    stats.forEach(s => { statsMap[s._id] = s; });

    const categoriesWithStats = categories.map((cat) => {
      const catStats = statsMap[cat.slug] || { count: 0, needsRestock: false };
      return {
        id: cat.slug,
        name: cat.name,
        available: cat.available,
        itemCount: catStats.count,
        needRestock: catStats.needsRestock
      };
    });

    res.status(200).json({ success: true, count: categoriesWithStats.length, data: categoriesWithStats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { getCategories };
