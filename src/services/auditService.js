const AuditLog = require('../models/AuditLog');

class AuditService {
  /**
   * Log an activity performed by an admin or editor.
   */
  async logActivity({ userId, action, targetEntity, targetId = '', details = {}, req = null }) {
    try {
      if (!userId) return;

      const ipAddress = req
        ? req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
        : '';

      await AuditLog.create({
        user: userId,
        action,
        targetEntity,
        targetId: targetId ? targetId.toString() : '',
        details,
        ipAddress
      });
    } catch (error) {
      console.error('[AuditService] Failed to record audit log:', error.message);
    }
  }

  /**
   * Retrieve audit logs with optional filters & pagination for Admin monitoring.
   */
  async getAuditLogs({ userId, action, targetEntity, page = 1, limit = 20 }) {
    const query = {};
    if (userId) query.user = userId;
    if (action) query.action = new RegExp(action, 'i');
    if (targetEntity) query.targetEntity = targetEntity;

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('user', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AuditLog.countDocuments(query)
    ]);

    return {
      logs,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit)
    };
  }
}

module.exports = new AuditService();
