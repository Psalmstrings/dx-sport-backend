const express = require('express');
const router = express.Router();
const { getLeagues, createLeague } = require('../controllers/leagueController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.get('/', getLeagues);
router.post('/', protect, authorize('admin'), createLeague);

module.exports = router;
