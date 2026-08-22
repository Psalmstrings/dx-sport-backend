const Post = require('../models/Post');
const auditService = require('../services/auditService');

// Helper to generate slug from title
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-');
};

const formatPostDoc = (doc) => {
  if (!doc) return doc;
  const p = doc.toObject ? doc.toObject() : { ...doc };
  p.image = p.coverImage || p.image || '';
  p.coverImage = p.image;
  return p;
};

// @desc    Get all blog posts (Public)
// @route   GET /api/v1/posts
// @access  Public
const getPosts = async (req, res, next) => {
  try {
    const { category, tag, search, status, page = 1, limit = 10 } = req.query;

    const query = {};
    if (category) query.category = category;
    if (tag) query.tags = tag;

    // Public users only see published posts unless authenticated admin/editor explicitly asks for drafts
    if (status && (req.user?.role === 'admin' || req.user?.role === 'editor')) {
      query.status = status;
    } else {
      query.status = 'published';
    }

    if (search) {
      query.$or = [
        { title: new RegExp(search, 'i') },
        { summary: new RegExp(search, 'i') },
        { content: new RegExp(search, 'i') }
      ];
    }

    const skip = (page - 1) * limit;

    const [rawPosts, total] = await Promise.all([
      Post.find(query)
        .populate('author', 'name email avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Post.countDocuments(query)
    ]);

    const posts = rawPosts.map(formatPostDoc);

    res.status(200).json({
      success: true,
      count: posts.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      posts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single post by slug (Public)
// @route   GET /api/v1/posts/:slug
// @access  Public
const getPostBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const rawPost = await Post.findOne({ slug }).populate('author', 'name email avatar');

    if (!rawPost) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Increment view counter
    rawPost.views += 1;
    await rawPost.save({ validateBeforeSave: false });

    const post = formatPostDoc(rawPost);

    res.status(200).json({
      success: true,
      post
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new post
// @route   POST /api/v1/posts
// @access  Private (Admin, Editor)
const createPost = async (req, res, next) => {
  try {
    const { title, summary, content, coverImage, image, category, tags, status } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required'
      });
    }

    let baseSlug = slugify(title);
    let slug = baseSlug;
    let counter = 1;

    while (await Post.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const finalImage = coverImage || image || '';

    const newPost = await Post.create({
      title,
      slug,
      summary: summary || '',
      content,
      coverImage: finalImage,
      category: category || 'NEWS',
      tags: Array.isArray(tags) ? tags : tags ? tags.split(',').map((t) => t.trim()) : [],
      author: req.user._id,
      status: status || 'published'
    });

    const post = formatPostDoc(newPost);

    await auditService.logActivity({
      userId: req.user._id,
      action: 'CREATE_POST',
      targetEntity: 'Post',
      targetId: post._id,
      details: { title: post.title, slug: post.slug, category: post.category },
      req
    });

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update post
// @route   PUT /api/v1/posts/:id
// @access  Private (Admin, Editor)
const updatePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    let post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Role check: Editor can update their own post, Admin can update any post
    if (req.user.role !== 'admin' && post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this post'
      });
    }

    const { title, summary, content, coverImage, image, category, tags, status } = req.body;

    if (title && title !== post.title) {
      post.title = title;
      let baseSlug = slugify(title);
      let slug = baseSlug;
      let counter = 1;
      while (await Post.findOne({ slug, _id: { $ne: post._id } })) {
        slug = `${baseSlug}-${counter++}`;
      }
      post.slug = slug;
    }

    if (summary !== undefined) post.summary = summary;
    if (content !== undefined) post.content = content;
    if (coverImage !== undefined || image !== undefined) {
      post.coverImage = coverImage || image || post.coverImage;
    }
    if (category !== undefined) post.category = category;
    if (status !== undefined) post.status = status;
    if (tags !== undefined) {
      post.tags = Array.isArray(tags) ? tags : tags.split(',').map((t) => t.trim());
    }

    await post.save();

    await auditService.logActivity({
      userId: req.user._id,
      action: 'UPDATE_POST',
      targetEntity: 'Post',
      targetId: post._id,
      details: { title: post.title, updatedByRole: req.user.role },
      req
    });

    res.status(200).json({
      success: true,
      message: 'Post updated successfully',
      post: formatPostDoc(post)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete post
// @route   DELETE /api/v1/posts/:id
// @access  Private (Admin, Editor if owner)
const deletePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Role check: Admin can delete any post. Editor can only delete their own post
    if (req.user.role !== 'admin' && post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only Admins can delete any post. Editors can only delete their own posts.'
      });
    }

    await Post.findByIdAndDelete(id);

    await auditService.logActivity({
      userId: req.user._id,
      action: 'DELETE_POST',
      targetEntity: 'Post',
      targetId: id,
      details: { postTitle: post.title, deletedByRole: req.user.role },
      req
    });

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPosts,
  getPostBySlug,
  createPost,
  updatePost,
  deletePost
};
