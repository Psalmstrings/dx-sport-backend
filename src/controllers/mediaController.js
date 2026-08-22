const path = require('path');
const fs = require('fs');
const Media = require('../models/Media');
const auditService = require('../services/auditService');
const { isCloudinaryConfigured, uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// @desc    Get media gallery items
// @route   GET /api/v1/media
// @access  Public
const getMedia = async (req, res, next) => {
  try {
    const { tag, search, page = 1, limit = 12 } = req.query;

    const query = {};
    if (tag) query.tags = tag;
    if (search) {
      query.$or = [
        { title: new RegExp(search, 'i') },
        { caption: new RegExp(search, 'i') },
        { filename: new RegExp(search, 'i') }
      ];
    }

    const skip = (page - 1) * limit;

    const [media, total] = await Promise.all([
      Media.find(query)
        .populate('uploader', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Media.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: media.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      media
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload new image/media to gallery (Cloudinary supported)
// @route   POST /api/v1/media/upload
// @access  Private (Admin, Editor)
const uploadMedia = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image file'
      });
    }

    const { title, caption, tags } = req.body;
    let fileUrl = `/uploads/${req.file.filename}`;
    let publicId = '';
    let isCloudinary = false;

    // Check if Cloudinary is configured
    if (isCloudinaryConfigured()) {
      try {
        const cloudResult = await uploadToCloudinary(req.file.path, 'dx_sport_gallery');
        fileUrl = cloudResult.url;
        publicId = cloudResult.publicId;
        isCloudinary = true;

        // Clean up local temp file after Cloudinary upload
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (cloudErr) {
        console.warn('[Cloudinary Warning] Cloudinary upload failed, using local storage:', cloudErr.message);
      }
    }

    const media = await Media.create({
      title: title || req.file.originalname,
      filename: req.file.filename,
      url: fileUrl,
      publicId: publicId || '',
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploader: req.user._id,
      caption: caption || '',
      tags: Array.isArray(tags) ? tags : tags ? tags.split(',').map((t) => t.trim()) : []
    });

    await auditService.logActivity({
      userId: req.user._id,
      action: 'UPLOAD_MEDIA',
      targetEntity: 'Media',
      targetId: media._id,
      details: { filename: media.filename, url: media.url, isCloudinary },
      req
    });

    res.status(201).json({
      success: true,
      message: `Media uploaded successfully${isCloudinary ? ' to Cloudinary' : ' to local server'}!`,
      isCloudinary,
      media
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete media item (from Cloudinary or local disk)
// @route   DELETE /api/v1/media/:id
// @access  Private (Admin, Editor)
const deleteMedia = async (req, res, next) => {
  try {
    const { id } = req.params;
    const media = await Media.findById(id);

    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media item not found'
      });
    }

    // Role check: Admin can delete any, Editor can delete their own
    if (req.user.role !== 'admin' && media.uploader.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this media item'
      });
    }

    // Delete from Cloudinary if publicId exists
    if (media.publicId) {
      await deleteFromCloudinary(media.publicId);
    } else if (media.url && media.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../../public', media.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await Media.findByIdAndDelete(id);

    await auditService.logActivity({
      userId: req.user._id,
      action: 'DELETE_MEDIA',
      targetEntity: 'Media',
      targetId: id,
      details: { filename: media.filename },
      req
    });

    res.status(200).json({
      success: true,
      message: 'Media item deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMedia,
  uploadMedia,
  deleteMedia
};
