const express = require('express');
const router = express.Router();
const {
  getMatches,
  getMatchById,
  createMatch,
  updateMatch,
  updateScoreline,
  cancelMatch,
  addMatchEvent,
  deleteMatch
} = require('../controllers/matchController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Public endpoints
router.get('/', getMatches);
router.get('/:id', getMatchById);

// Editor & Admin restricted endpoints
router.post('/', protect, authorize('admin', 'editor'), createMatch);
router.put('/:id', protect, authorize('admin', 'editor'), updateMatch);
router.patch('/:id/scoreline', protect, authorize('admin', 'editor'), updateScoreline);
router.patch('/:id/cancel', protect, authorize('admin', 'editor'), cancelMatch);
router.post('/:id/events', protect, authorize('admin', 'editor'), addMatchEvent);

// Admin only match deletion
router.delete('/:id', protect, authorize('admin'), deleteMatch);

module.exports = router;
