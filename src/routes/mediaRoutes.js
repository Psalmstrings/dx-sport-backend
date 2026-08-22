const express = require('express');
const router = express.Router();
const { getMedia, uploadMedia, deleteMedia } = require('../controllers/mediaController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.get('/', getMedia);
router.post('/upload', protect, authorize('admin', 'editor'), upload.single('file'), uploadMedia);
router.delete('/:id', protect, authorize('admin', 'editor'), deleteMedia);

module.exports = router;
