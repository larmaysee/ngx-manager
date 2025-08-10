/**
 * SSL Certificate Renewal Management API routes
 * Handle renewal monitoring, statistics, and manual triggers
 */
import { Router, type Request, type Response } from "express";
import pool from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import {
  paginationValidation,
  domainValidation,
  handleValidationErrors,
  sanitizeInput,
} from "../middleware/validation.js";
import { renewalScheduler } from "../services/renewalScheduler.js";
import { logError, asyncHandler } from "../utils/errorHandler.js";

const router = Router();

// All renewal routes require authentication
router.use(authenticateToken);

/**
 * Get renewal statistics and status
 * GET /api/renewal/stats
 */
router.get(
  "/stats",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const stats = await renewalScheduler.getRenewalStats();

    res.json({
      success: true,
      stats,
    });
  })
);

/**
 * Get renewal logs
 * GET /api/renewal/logs
 */
router.get(
  "/logs",
  paginationValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const connection = await pool.getConnection();
    try {
      // Get total count
      const [countResult] = await connection.execute(
        "SELECT COUNT(*) as total FROM renewal_logs"
      );
      const total = (countResult as any[])[0].total;

      // Get logs with pagination
      const [logs] = await connection.execute(
        `SELECT id, domain, status, error_message, created_at
         FROM renewal_logs
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      res.json({
        success: true,
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } finally {
      connection.release();
    }
  })
);

/**
 * Get renewal logs for a specific domain
 * GET /api/renewal/logs/:domain
 */
router.get(
  "/logs/:domain",
  domainValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const domain = req.params.domain;

    const connection = await pool.getConnection();
    try {
      const [logs] = await connection.execute(
        `SELECT id, domain, status, error_message, created_at
         FROM renewal_logs
         WHERE domain = ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [domain]
      );

      res.json({
        success: true,
        domain,
        logs,
      });
    } finally {
      connection.release();
    }
  })
);

/**
 * Trigger manual renewal check
 * POST /api/renewal/check
 */
router.post(
  "/check",
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Run renewal check in background
    renewalScheduler.forceRenewalCheck().catch((error) => {
      logError("Manual renewal check error:", error);
    });

    res.json({
      success: true,
      message: "Manual renewal check initiated",
    });
  })
);

/**
 * Get certificates expiring soon
 * GET /api/renewal/expiring
 */
router.get(
  "/expiring",
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const days = Math.min(
      Math.max(parseInt(req.query.days as string) || 30, 1),
      365
    );

    const connection = await pool.getConnection();
    try {
      const [certificates] = await connection.execute(
        `SELECT s.id, s.proxy_id, s.domain, s.expires_at, s.status,
                p.user_id, p.target_host, p.target_port
         FROM ssl_certificates s
         JOIN proxies p ON s.proxy_id = p.id
         WHERE s.status = 'valid'
         AND s.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
         AND s.expires_at > NOW()
         ORDER BY s.expires_at ASC`,
        [days]
      );

      // Calculate days until expiry for each certificate
      const certificatesWithExpiry = (certificates as any[]).map((cert) => {
        const now = new Date();
        const expiresAt = new Date(cert.expires_at);
        const daysUntilExpiry = Math.ceil(
          (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          ...cert,
          days_until_expiry: daysUntilExpiry,
        };
      });

      res.json({
        success: true,
        certificates: certificatesWithExpiry,
        count: certificatesWithExpiry.length,
      });
    } finally {
      connection.release();
    }
  })
);

/**
 * Get renewal system health status
 * GET /api/renewal/health
 */
router.get(
  "/health",
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
      // Check recent renewal activity (last 24 hours)
      const [recentActivity] = await connection.execute(
        `SELECT COUNT(*) as count
         FROM renewal_logs
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
      );

      // Check failed renewals in last 7 days
      const [failedRenewals] = await connection.execute(
        `SELECT COUNT(*) as count
         FROM renewal_logs
         WHERE status IN ('failed', 'error')
         AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
      );

      // Check certificates expiring in next 7 days
      const [criticalExpiring] = await connection.execute(
        `SELECT COUNT(*) as count
         FROM ssl_certificates s
         JOIN proxies p ON s.proxy_id = p.id
         WHERE s.status = 'valid'
         AND s.expires_at <= DATE_ADD(NOW(), INTERVAL 7 DAY)
         AND s.expires_at > NOW()`
      );

      const stats = await renewalScheduler.getRenewalStats();

      const health = {
        scheduler_running: stats.scheduler_running,
        recent_activity: (recentActivity as any[])[0].count,
        failed_renewals_7d: (failedRenewals as any[])[0].count,
        critical_expiring: (criticalExpiring as any[])[0].count,
        certificates_expiring_30d: stats.certificates_expiring_soon,
        status: "healthy", // Will be determined based on the metrics
      };

      // Determine overall health status
      if (!health.scheduler_running) {
        health.status = "critical";
      } else if (
        health.critical_expiring > 0 ||
        health.failed_renewals_7d > 5
      ) {
        health.status = "warning";
      } else {
        health.status = "healthy";
      }

      res.json({
        success: true,
        health,
      });
    } finally {
      connection.release();
    }
  })
);

export default router;
