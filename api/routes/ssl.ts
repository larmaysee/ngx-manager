/**
 * SSL certificate management API routes
 * Handle SSL certificate operations, status, and renewal
 */
import express, { Request, Response } from "express";
import pool from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import {
  idValidation,
  handleValidationErrors,
  sanitizeInput,
} from "../middleware/validation.js";
import certbotService from "../services/certbotService.js";
import {
  logError,
  createDatabaseError,
  createNotFoundError,
  createValidationError,
  asyncHandler,
} from "../utils/errorHandler.js";
import { logger } from "api/config/logger.js";

const router = express.Router();

// All SSL routes require authentication
router.use(authenticateToken);

/**
 * Get SSL certificates for user's proxies
 * GET /api/ssl/certificates
 */ router.get(
  "/certificates",
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        `SELECT s.id, s.proxy_id, s.domain, s.status, s.expires_at, 
                s.created_at, p.domain as proxy_domain
         FROM ssl_certificates s
         JOIN proxies p ON s.proxy_id = p.id
         WHERE p.user_id = ?
         ORDER BY s.created_at DESC`,
        [req.user!.id]
      );

      res.json({
        success: true,
        certificates: rows,
      });
    } finally {
      connection.release();
    }
  })
);

/**
 * Get SSL certificate status for a specific proxy
 * GET /api/ssl/status/:proxyId
 */
router.get(
  "/status/:proxyId",
  idValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const proxyId = parseInt(req.params.proxyId);

    const connection = await pool.getConnection();
    try {
      // Verify proxy belongs to user
      const [proxyCheck] = await connection.execute(
        "SELECT id, domain FROM proxies WHERE id = ? AND user_id = ?",
        [proxyId, req.user!.id]
      );

      type ProxyRow = { id: number; domain: string };
      if ((proxyCheck as ProxyRow[]).length === 0) {
        throw createNotFoundError("Proxy not found");
      }

      // Get SSL certificate status
      const [sslRows] = await connection.execute(
        `SELECT id, domain, status, expires_at, created_at
         FROM ssl_certificates 
         WHERE proxy_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [proxyId]
      );

      type CertRow = {
        id: number;
        domain: string;
        status: string;
        expires_at: string;
        created_at: string;
      };
      const certificates = sslRows as CertRow[];
      const proxy = (proxyCheck as ProxyRow[])[0];

      if (certificates.length === 0) {
        res.json({
          success: true,
          proxy_id: proxyId,
          domain: proxy.domain,
          ssl_status: "none",
          certificate: null,
        });
        return;
      }

      const certificate = certificates[0];
      const now = new Date();
      const expiresAt = new Date(certificate.expires_at);
      const daysUntilExpiry = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      res.json({
        success: true,
        proxy_id: proxyId,
        domain: proxy.domain,
        ssl_status: certificate.status,
        certificate: {
          ...certificate,
          days_until_expiry: daysUntilExpiry,
          is_expired: daysUntilExpiry <= 0,
          needs_renewal: daysUntilExpiry <= 30,
        },
      });
    } finally {
      connection.release();
    }
  })
);

/**
 * Test reachability for one or more domains before requesting certs
 * POST /api/ssl/reachability
 * body: { domains: string[] }
 */
router.post(
  "/reachability",
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const domains: string[] = Array.isArray(req.body.domains)
      ? req.body.domains
      : [];
    if (!domains.length) {
      throw createValidationError("domains array required");
    }

    logger.info("Testing domain reachability", { domains });

    const checks = await Promise.all(
      domains.map((d) => certbotService.testDomain(d.trim()))
    );
    res.json({ success: true, results: checks });
  })
);

/**
 * Request SSL certificate for a proxy (single or multi-domain via body.extra_domains)
 * POST /api/ssl/request/:proxyId
 * body: { extra_domains?: string[], email?: string }
 */
router.post(
  "/request/:proxyId",
  idValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const proxyId = parseInt(req.params.proxyId);

    const connection = await pool.getConnection();
    try {
      // Verify proxy belongs to user and get domain
      const [proxyCheck] = await connection.execute(
        "SELECT id, domain FROM proxies WHERE id = ? AND user_id = ?",
        [proxyId, req.user!.id]
      );

      type ProxyRow2 = { id: number; domain: string };
      if ((proxyCheck as ProxyRow2[]).length === 0) {
        throw createNotFoundError("Proxy not found");
      }

      const proxy = (proxyCheck as ProxyRow2[])[0];

      // Check if there's already a pending or valid certificate
      const [existingCert] = await connection.execute(
        `SELECT id, status, expires_at FROM ssl_certificates 
         WHERE proxy_id = ? AND status IN ('pending', 'valid')
         ORDER BY created_at DESC
         LIMIT 1`,
        [proxyId]
      );

      type ExistingCertRow = { id: number; status: string; expires_at: string };
      if ((existingCert as ExistingCertRow[]).length > 0) {
        const cert = (existingCert as ExistingCertRow[])[0];
        if (cert.status === "pending") {
          throw createValidationError(
            "SSL certificate request is already pending"
          );
        }

        if (cert.status === "valid") {
          const expiresAt = new Date(cert.expires_at);
          const now = new Date();
          const daysUntilExpiry = Math.ceil(
            (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntilExpiry > 30) {
            throw createValidationError(
              `SSL certificate is still valid for ${daysUntilExpiry} days. Renewal is only allowed within 30 days of expiry.`
            );
          }
        }
      }

      // Create new SSL certificate request
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90); // Let's Encrypt certificates are valid for 90 days

      const [result] = await connection.execute(
        `INSERT INTO ssl_certificates (proxy_id, domain, status, expires_at) 
         VALUES (?, ?, 'pending', ?)`,
        [proxyId, proxy.domain, expiresAt]
      );

      const certificateId = (result as { insertId: number }).insertId;

      // Trigger actual Certbot certificate generation (multi-domain supported)
      const extraDomains: string[] = Array.isArray(req.body.extra_domains)
        ? req.body.extra_domains
        : [];
      const email: string | undefined =
        typeof req.body.email === "string" ? req.body.email : undefined;
      try {
        const info = await certbotService.obtainCertificate(
          proxy.domain,
          extraDomains,
          email
        );
        const finalStatus = info.status === "valid" ? "valid" : "failed";
        await connection.execute(
          `UPDATE ssl_certificates 
             SET status = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          [finalStatus, info.expires_at || expiresAt, certificateId]
        );
      } catch (certError) {
        logError(
          "Certbot certificate generation error",
          certError instanceof Error ? certError.message : String(certError),
          certificateId
        );
        await connection.execute(
          `UPDATE ssl_certificates 
             SET status = 'failed', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          [certificateId]
        );
      }

      res.status(201).json({
        success: true,
        message: "SSL certificate request initiated",
        certificate_id: certificateId,
        status: "pending",
        domain: proxy.domain,
        extra_domains: req.body.extra_domains || [],
      });
    } finally {
      connection.release();
    }
  })
);

/**
 * Renew SSL certificate for a proxy
 * POST /api/ssl/renew/:proxyId
 */
router.post(
  "/renew/:proxyId",
  idValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const proxyId = parseInt(req.params.proxyId);

    const connection = await pool.getConnection();
    try {
      // Verify proxy belongs to user
      const [proxyCheck] = await connection.execute(
        "SELECT id, domain FROM proxies WHERE id = ? AND user_id = ?",
        [proxyId, req.user!.id]
      );

      type ProxyRow3 = { id: number; domain: string };
      if ((proxyCheck as ProxyRow3[]).length === 0) {
        throw createNotFoundError("Proxy not found");
      }

      const proxy = (proxyCheck as ProxyRow3[])[0];

      // Get current certificate
      const [currentCert] = await connection.execute(
        `SELECT id, status, expires_at FROM ssl_certificates 
         WHERE proxy_id = ? 
         ORDER BY created_at DESC
         LIMIT 1`,
        [proxyId]
      );

      type CurrentCertRow = { id: number; status: string; expires_at: string };
      if ((currentCert as CurrentCertRow[]).length === 0) {
        throw createNotFoundError("No SSL certificate found for this proxy");
      }

      const cert = (currentCert as CurrentCertRow[])[0];

      // Check if renewal is needed
      const expiresAt = new Date(cert.expires_at);
      const now = new Date();
      const daysUntilExpiry = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiry > 30 && cert.status === "valid") {
        throw createValidationError(
          `Certificate is still valid for ${daysUntilExpiry} days. Renewal is only allowed within 30 days of expiry.`
        );
      }

      // Mark current certificate as expired
      await connection.execute(
        `UPDATE ssl_certificates 
         SET status = 'expired', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [cert.id]
      );

      // Create new certificate request
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 90);

      const [result] = await connection.execute(
        `INSERT INTO ssl_certificates (proxy_id, domain, status, expires_at) 
         VALUES (?, ?, 'pending', ?)`,
        [proxyId, proxy.domain, newExpiresAt]
      );

      const newCertificateId = (result as { insertId: number }).insertId;

      // Trigger actual Certbot certificate renewal
      try {
        const info = await certbotService.renew(proxy.domain);

        if (info.status === "valid") {
          // Update certificate status to valid
          await connection.execute(
            `UPDATE ssl_certificates 
             SET status = 'valid', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [newCertificateId]
          );
        } else {
          // Update certificate status to failed
          await connection.execute(
            `UPDATE ssl_certificates 
             SET status = 'failed', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [newCertificateId]
          );
        }
      } catch (renewError) {
        logError(
          "Certbot certificate renewal error",
          renewError.toString(),
          newCertificateId
        );
        // Update certificate status to failed
        await connection.execute(
          `UPDATE ssl_certificates 
           SET status = 'failed', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [newCertificateId]
        );
      }

      res.json({
        success: true,
        message: "SSL certificate renewal initiated",
        certificate_id: newCertificateId,
        status: "pending",
        domain: proxy.domain,
      });
    } finally {
      connection.release();
    }
  })
);

/**
 * Revoke SSL certificate
 * POST /api/ssl/revoke/:id
 */
router.post(
  "/revoke/:id",
  idValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const certificateId = parseInt(req.params.id);

    const connection = await pool.getConnection();
    try {
      // Verify certificate belongs to user's proxy and get domain
      type CertCheckRow = { id: number; domain: string; status: string };
      const [certCheck] = await connection.execute(
        `SELECT s.id, s.domain, s.status FROM ssl_certificates s
         JOIN proxies p ON s.proxy_id = p.id
         WHERE s.id = ? AND p.user_id = ?`,
        [certificateId, req.user!.id]
      );
      if ((certCheck as CertCheckRow[]).length === 0) {
        throw createNotFoundError("SSL certificate not found");
      }
      const certificate = (certCheck as CertCheckRow[])[0];

      if (certificate.status !== "valid") {
        throw createValidationError("Only valid certificates can be revoked");
      }

      // Revoke certificate using Certbot
      try {
        await certbotService.revoke(certificate.domain);

        // Update certificate status to revoked
        await connection.execute(
          `UPDATE ssl_certificates 
           SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [certificateId]
        );

        res.json({
          success: true,
          message: "SSL certificate revoked successfully",
        });
      } catch (revokeError) {
        logError(
          "Certbot certificate revocation error",
          revokeError.toString(),
          certificateId
        );
        throw createDatabaseError("Failed to revoke SSL certificate");
      }
    } finally {
      connection.release();
    }
  })
);

/**
 * Delete SSL certificate
 * DELETE /api/ssl/certificates/:id
 */
router.delete(
  "/certificates/:id",
  idValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const certificateId = parseInt(req.params.id);

    const connection = await pool.getConnection();
    try {
      // Verify certificate belongs to user's proxy
      type CertCheckRow = { id: number; domain: string; status: string };
      const [certCheck] = await connection.execute(
        `SELECT s.id, s.domain, s.status FROM ssl_certificates s
         JOIN proxies p ON s.proxy_id = p.id
         WHERE s.id = ? AND p.user_id = ?`,
        [certificateId, req.user!.id]
      );
      if ((certCheck as CertCheckRow[]).length === 0) {
        throw createNotFoundError("SSL certificate not found");
      }
      const certificate = (certCheck as CertCheckRow[])[0];

      // If certificate is valid, revoke it first
      if (certificate.status === "valid") {
        try {
          await certbotService.revoke(certificate.domain);
        } catch (revokeError) {
          logError(
            "Error revoking certificate before deletion",
            revokeError.toString(),
            certificateId
          );
          // Continue with deletion even if revocation fails
        }
      }

      // Delete certificate from database
      await connection.execute("DELETE FROM ssl_certificates WHERE id = ?", [
        certificateId,
      ]);

      res.json({
        success: true,
        message: "SSL certificate deleted successfully",
      });
    } finally {
      connection.release();
    }
  })
);

export default router;
