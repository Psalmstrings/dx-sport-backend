const express = require('express');
const router = express.Router();
const {
  getLeagues,
  getLeagueById,
  createLeague,
  updateLeague,
  toggleLeagueStatus
} = require('../controllers/leagueController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.get('/', getLeagues);
router.get('/:id', getLeagueById);
router.post('/', protect, authorize('admin', 'editor'), createLeague);
router.put('/:id', protect, authorize('admin', 'editor'), updateLeague);
router.patch('/:id/status', protect, authorize('admin', 'editor'), toggleLeagueStatus);

module.exports = router;
