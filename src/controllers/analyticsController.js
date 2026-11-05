const analyticsService = require('../services/analyticsService');

// @desc    Track a visitor page view
// @route   POST /api/v1/analytics/track
// @access  Public
const trackVisit = async (req, res, next) => {
  try {
    const { visitorId, sessionId, path, title, referrer } = req.body;
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const country = req.headers['cf-ipcountry'] || req.headers['x-country'] || '';

    // Record visit asynchronously without blocking response
    analyticsService.recordVisit({
      visitorId,
      sessionId,
      path,
      title,
      referrer,
      userAgent,
      ip,
      country
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// @desc    Get aggregated visitor analytics dashboard data
// @route   GET /api/v1/analytics/dashboard
// @access  Private/Admin
const getDashboardAnalytics = async (req, res, next) => {
  try {
    const period = (req.query.period || 'week').toLowerCase();
    const data = await analyticsService.getAnalyticsStats(period);
    res.status(200).json({
      success: true,
      ...data
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Seed or reset sample visitor analytics data
// @route   POST /api/v1/analytics/seed
// @access  Private/Admin
const seedAnalyticsData = async (req, res, next) => {
  try {
    await analyticsService.seedRealisticData(true);
    const data = await analyticsService.getAnalyticsStats(req.query.period || 'week');
    res.status(200).json({
      success: true,
      message: 'Realistic analytics data generated successfully',
      ...data
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  trackVisit,
  getDashboardAnalytics,
  seedAnalyticsData
};
