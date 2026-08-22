const express = require('express');
const router = express.Router();
const {
  getTransfers,
  createTransfer,
  updateTransfer,
  deleteTransfer
} = require('../controllers/transferController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.get('/', getTransfers);
router.post('/', protect, authorize('admin', 'editor'), createTransfer);
router.put('/:id', protect, authorize('admin', 'editor'), updateTransfer);
router.delete('/:id', protect, authorize('admin', 'editor'), deleteTransfer);

module.exports = router;
