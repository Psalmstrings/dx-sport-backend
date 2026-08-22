const express = require('express');
const router = express.Router();
const { getTeams, createTeam, updateTeam, deleteTeam } = require('../controllers/teamController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.get('/', getTeams);
router.post('/', protect, authorize('admin', 'editor'), createTeam);
router.put('/:id', protect, authorize('admin', 'editor'), updateTeam);
router.delete('/:id', protect, authorize('admin', 'editor'), deleteTeam);

module.exports = router;
