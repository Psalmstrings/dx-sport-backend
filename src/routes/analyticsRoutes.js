const express = require('express');
const router = express.Router();
const {
  trackVisit,
  getDashboardAnalytics,
  seedAnalyticsData
} = require('../controllers/analyticsController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

// Public route to collect visitor telemetry
router.post('/track', trackVisit);

// Admin-only analytics dashboard & management
router.get('/dashboard', protect, authorize('admin'), getDashboardAnalytics);
router.post('/seed', protect, authorize('admin'), seedAnalyticsData);

module.exports = router;
