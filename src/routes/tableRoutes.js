const express = require('express');
const router = express.Router();
const { getStandings, recalculateStandings } = require('../controllers/tableController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.get('/', getStandings);
router.get('/:leagueId', getStandings);
router.post('/:leagueId/recalculate', protect, authorize('admin', 'editor'), recalculateStandings);

module.exports = router;
