import User from '../models/User.js';

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res) => {
  try {
    const { username, name, password, role } = req.body;

    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Generate random avatar seed
    const seed = encodeURIComponent(username.trim().toLowerCase());
    const randomBgHex = ['b6e3f4', 'd1d4f9', 'ffd5dc', 'ffdfd3', 'cbf3f0'][Math.floor(Math.random() * 5)];
    const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&backgroundColor=${randomBgHex}`;

    const user = await User.create({
      username,
      name,
      password,
      role: role || 'cashier',
      avatar: avatarUrl
    });

    res.status(201).json({ success: true, data: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.username === 'admin' && req.body.disabled !== undefined && req.body.disabled === true) {
      return res.status(400).json({ success: false, message: 'Cannot disable the main admin account' });
    }

    if (user.username === 'admin' && req.body.role && req.body.role !== 'admin') {
      return res.status(400).json({ success: false, message: 'Cannot change role of the main admin account' });
    }

    if (req.body.password) {
      user.password = req.body.password;
    }

    user.name = req.body.name || user.name;
    user.role = req.body.role || user.role;

    if (req.body.bankName !== undefined) {
      user.bankName = req.body.bankName;
    }
    if (req.body.bankAccountNumber !== undefined) {
      user.bankAccountNumber = req.body.bankAccountNumber;
    }

    if (req.body.disabled !== undefined) {
      user.disabled = req.body.disabled;
    }

    await user.save();

    res.status(200).json({ success: true, data: user.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.username === 'admin') {
      return res.status(400).json({ success: false, message: 'Cannot delete the main admin account' });
    }

    if (req.user.id === req.params.id) {
       return res.status(400).json({ success: false, message: 'Cannot delete yourself' });
    }

    await user.deleteOne();

    res.status(200).json({ success: true, message: 'User removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { getUsers, createUser, updateUser, deleteUser };
