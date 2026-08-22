const User = require('../models/User');
const Post = require('../models/Post');
const Match = require('../models/Match');
const Media = require('../models/Media');
const League = require('../models/League');
const auditService = require('../services/auditService');

// @desc    Add a new Editor account
// @route   POST /api/v1/admin/editors
// @access  Private/Admin
const addEditor = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const editor = await User.create({
      name,
      email,
      password,
      role: 'editor',
      status: 'active'
    });

    await auditService.logActivity({
      userId: req.user._id,
      action: 'ADD_EDITOR',
      targetEntity: 'User',
      targetId: editor._id,
      details: { editorName: editor.name, editorEmail: editor.email },
      req
    });

    res.status(201).json({
      success: true,
      message: 'Editor created successfully',
      editor: {
        id: editor._id,
        name: editor.name,
        email: editor.email,
        role: editor.role,
        status: editor.status,
        createdAt: editor.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove or suspend an Editor
// @route   DELETE /api/v1/admin/editors/:id
// @access  Private/Admin
const removeEditor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mode } = req.query; // mode=delete or mode=suspend (default delete)

    const editor = await User.findById(id);
    if (!editor) {
      return res.status(404).json({
        success: false,
        message: 'Editor not found'
      });
    }

    if (editor.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove an Admin user'
      });
    }

    if (mode === 'suspend') {
      editor.status = 'suspended';
      await editor.save();

      await auditService.logActivity({
        userId: req.user._id,
        action: 'SUSPEND_EDITOR',
        targetEntity: 'User',
        targetId: editor._id,
        details: { editorEmail: editor.email },
        req
      });

      return res.status(200).json({
        success: true,
        message: `Editor ${editor.name} suspended successfully`
      });
    }

    await User.findByIdAndDelete(id);

    await auditService.logActivity({
      userId: req.user._id,
      action: 'REMOVE_EDITOR',
      targetEntity: 'User',
      targetId: id,
      details: { editorEmail: editor.email },
      req
    });

    res.status(200).json({
      success: true,
      message: `Editor ${editor.name} removed successfully`
    });
  } catch (error) {
    next(error);
  }
};

// @desc    List all Editors
// @route   GET /api/v1/admin/editors
// @access  Private/Admin
const listEditors = async (req, res, next) => {
  try {
    const editors = await User.find({ role: 'editor' }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: editors.length,
      editors
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get system audit logs for monitoring all activity
// @route   GET /api/v1/admin/audit-logs
// @access  Private/Admin
const getAuditLogs = async (req, res, next) => {
  try {
    const { userId, action, targetEntity, page, limit } = req.query;
    const result = await auditService.getAuditLogs({
      userId,
      action,
      targetEntity,
      page: page || 1,
      limit: limit || 20
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get admin dashboard overall metrics
// @route   GET /api/v1/admin/stats
// @access  Private/Admin
const getDashboardStats = async (req, res, next) => {
  try {
    const [totalEditors, totalPosts, totalMatches, totalMedia, totalLeagues, liveMatches] =
      await Promise.all([
        User.countDocuments({ role: 'editor' }),
        Post.countDocuments(),
        Match.countDocuments(),
        Media.countDocuments(),
        League.countDocuments({ isActive: true }),
        Match.countDocuments({ status: 'LIVE' })
      ]);

    res.status(200).json({
      success: true,
      stats: {
        totalEditors,
        totalPosts,
        totalMatches,
        liveMatches,
        totalMedia,
        totalLeagues
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addEditor,
  removeEditor,
  listEditors,
  getAuditLogs,
  getDashboardStats
};
