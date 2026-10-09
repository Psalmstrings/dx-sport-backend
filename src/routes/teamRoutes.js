const express = require('express');
const router = express.Router();
const {
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  assignCompetition,
  removeCompetition,
  deleteTeam
} = require('../controllers/teamController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

router.get('/', getTeams);
router.get('/:id', getTeamById);
router.post('/', protect, authorize('admin', 'editor'), createTeam);
router.put('/:id', protect, authorize('admin', 'editor'), updateTeam);
router.post('/:id/competitions', protect, authorize('admin', 'editor'), assignCompetition);
router.delete('/:id/competitions/:competitionId', protect, authorize('admin', 'editor'), removeCompetition);
router.delete('/:id', protect, authorize('admin', 'editor'), deleteTeam);

module.exports = router;
