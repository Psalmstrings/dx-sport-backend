const express = require('express');
const router = express.Router();
const {
  addEditor,
  removeEditor,
  listEditors,
  getAuditLogs,
  getDashboardStats
} = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Enforce Protect and Admin Authorization for all routes
router.use(protect);
router.use(authorize('admin'));

router.post('/editors', addEditor);
router.get('/editors', listEditors);
router.delete('/editors/:id', removeEditor);
router.get('/audit-logs', getAuditLogs);
router.get('/stats', getDashboardStats);

module.exports = router;
