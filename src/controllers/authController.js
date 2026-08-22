const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auditService = require('../services/auditService');

const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'dx_sport_super_secret_jwt_key_2026_change_in_production',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// @desc    Login user (Admin or Editor)
// @route   POST /api/v1/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = await User.findOne({ email: cleanEmail }).select('+password');

    // Auto-create default admin account if logging in with valid initial credentials
    if (!user && (cleanEmail === 'admin@elitesport.ng' || cleanEmail === 'admin@dxsport.com') && password === 'admin123') {
      user = await User.create({
        name: cleanEmail === 'admin@elitesport.ng' ? 'Elite Admin' : 'DX Sport Admin',
        email: cleanEmail,
        password: 'admin123',
        role: 'admin',
        status: 'active'
      });
      user = await User.findById(user._id).select('+password');
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Account suspended. Please contact Admin.'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = generateToken(user._id);

    // Audit log
    await auditService.logActivity({
      userId: user._id,
      action: 'USER_LOGIN',
      targetEntity: 'User',
      targetId: user._id,
      details: { email: user.email, role: user.role },
      req
    });

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user profile
// @route   GET /api/v1/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change current user password
// @route   PUT /api/v1/auth/change-password
// @access  Private
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select('+password');

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    await auditService.logActivity({
      userId: user._id,
      action: 'CHANGE_PASSWORD',
      targetEntity: 'User',
      targetId: user._id,
      req
    });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getMe,
  changePassword
};
