const express = require('express');
const router = express.Router();
const {
  getPosts,
  getPostBySlug,
  createPost,
  updatePost,
  deletePost
} = require('../controllers/postController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.get('/', getPosts);
router.get('/:slug', getPostBySlug);

// Restricted endpoints (Editor & Admin)
router.post('/', protect, authorize('admin', 'editor'), createPost);
router.put('/:id', protect, authorize('admin', 'editor'), updatePost);
router.delete('/:id', protect, authorize('admin', 'editor'), deletePost);

module.exports = router;
