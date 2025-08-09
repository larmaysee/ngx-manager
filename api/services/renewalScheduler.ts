/**
 * SSL Certificate Auto-Renewal Scheduler
 * Background job system for automatic SSL certificate renewal
 */
import cron, { ScheduledTask } from "node-cron";
import { pool } from "../config/database.js";
import certbotService from "./certbotService.js";
import { logError } from "../utils/errorHandler.js";

export class RenewalScheduler {
  private isRunning: boolean = false;
  private cronJob: ScheduledTask | null = null;

  constructor() {
    console.log("RenewalScheduler initialized");
  }

  /**
   * Start the renewal scheduler
   * Runs daily at 2:00 AM to check for certificates that need renewal
   */
  start(): void {
    if (this.isRunning) {
      console.log("Renewal scheduler is already running");
      return;
    }

    // Schedule to run daily at 2:00 AM
    this.cronJob = cron.schedule(
      "0 2 * * *",
      async () => {
        console.log("Running SSL certificate renewal check...");
        await this.checkAndRenewCertificates();
      },
      {
        scheduled: true,
        timezone: "UTC",
      }
    );

    this.isRunning = true;
    console.log(
      "SSL certificate renewal scheduler started (runs daily at 2:00 AM UTC)"
    );
  }

  /**
   * Stop the renewal scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    console.log("SSL certificate renewal scheduler stopped");
  }

  /**
   * Check for certificates that need renewal and renew them
   */
  async checkAndRenewCertificates(): Promise<void> {
    const connection = await pool.getConnection();

    try {
      // Find certificates that expire within 30 days and are currently valid
      const [rows] = await connection.execute(`
        SELECT s.id, s.proxy_id, s.domain, s.expires_at, p.user_id
        FROM ssl_certificates s
        JOIN proxies p ON s.proxy_id = p.id
        WHERE s.status = 'valid'
        AND s.expires_at <= DATE_ADD(NOW(), INTERVAL 30 DAY)
        AND s.expires_at > NOW()
        ORDER BY s.expires_at ASC
      `);

      interface CertRow {
        id: number;
        proxy_id: number;
        domain: string;
        expires_at: string;
        user_id: number;
      }
      const certificates = rows as CertRow[];

      if (certificates.length === 0) {
        console.log("No certificates require renewal at this time");
        return;
      }

      console.log(
        `Found ${certificates.length} certificate(s) that need renewal`
      );

      for (const cert of certificates) {
        await this.renewCertificate(cert, connection);
      }
    } catch (error) {
      logError(
        "Error during certificate renewal check:",
        (error as Error).message
      );
    } finally {
      connection.release();
    }
  }

  /**
   * Renew a specific certificate
   */
  private async renewCertificate(
    cert: { id: number; proxy_id: number; domain: string },
    connection: {
      execute: (sql: string, params?: unknown[]) => Promise<unknown>;
    }
  ): Promise<void> {
    try {
      console.log(`Attempting to renew certificate for domain: ${cert.domain}`);

      // Mark current certificate as expired
      await connection.execute(
        `UPDATE ssl_certificates 
         SET status = 'expired', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [cert.id]
      );

      // Create new certificate request
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 90); // Let's Encrypt certificates are valid for 90 days

      const insertResult = (await connection.execute(
        `INSERT INTO ssl_certificates (proxy_id, domain, status, expires_at) 
         VALUES (?, ?, 'pending', ?)`,
        [cert.proxy_id, cert.domain, newExpiresAt]
      )) as unknown as [{ insertId: number }];

      const newCertificateId = insertResult[0].insertId;

      // Attempt to renew the certificate using Certbot (new API returns info)
      const info = await certbotService.renew(cert.domain);

      if (info.status === "valid") {
        // Update certificate status to valid
        await connection.execute(
          `UPDATE ssl_certificates 
           SET status = 'valid', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [newCertificateId]
        );

        console.log(
          `Successfully renewed certificate for domain: ${cert.domain}`
        );

        // Log renewal event
        await this.logRenewalEvent(cert.domain, "success", connection);
      } else {
        // Update certificate status to failed
        await connection.execute(
          `UPDATE ssl_certificates 
           SET status = 'failed', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [newCertificateId]
        );

        logError(
          `Failed to renew certificate for domain: ${cert.domain}`,
          "Certificate renewal failed"
        );

        // Log renewal event
        await this.logRenewalEvent(cert.domain, "failed", connection);
      }
    } catch (error) {
      logError(
        `Error renewing certificate for domain ${cert.domain}:`,
        (error as Error).message
      );

      // Log renewal event
      await this.logRenewalEvent(cert.domain, "error", connection);
    }
  }

  /**
   * Log renewal events for monitoring and debugging
   */
  private async logRenewalEvent(
    domain: string,
    status: "success" | "failed" | "error",
    connection: {
      execute: (sql: string, params?: unknown[]) => Promise<unknown>;
    }
  ): Promise<void> {
    try {
      await connection.execute(
        `INSERT INTO renewal_logs (domain, status, created_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [domain, status]
      );
    } catch (error) {
      logError("Error logging renewal event:", (error as Error).message);
    }
  }

  /**
   * Get renewal statistics
   */
  async getRenewalStats(): Promise<{
    certificates_expiring_soon: number;
    recent_renewals: unknown;
    scheduler_running: boolean;
  }> {
    const connection = await pool.getConnection();

    try {
      // Get certificates expiring in the next 30 days
      const [expiringCerts] = await connection.execute(`
        SELECT COUNT(*) as count
        FROM ssl_certificates s
        JOIN proxies p ON s.proxy_id = p.id
        WHERE s.status = 'valid'
        AND s.expires_at <= DATE_ADD(NOW(), INTERVAL 30 DAY)
        AND s.expires_at > NOW()
      `);

      // Get recent renewal attempts (last 7 days)
      const [recentRenewals] = await connection.execute(`
        SELECT status, COUNT(*) as count
        FROM renewal_logs
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY status
      `);

      interface CountRow {
        count: number;
      }
      const soon = (expiringCerts as CountRow[])[0]?.count || 0;
      return {
        certificates_expiring_soon: soon,
        recent_renewals: recentRenewals,
        scheduler_running: this.isRunning,
      };
    } finally {
      connection.release();
    }
  }

  /**
   * Force renewal check (for testing or manual trigger)
   */
  async forceRenewalCheck(): Promise<void> {
    console.log("Manual renewal check triggered");
    await this.checkAndRenewCertificates();
  }
}

// Export singleton instance
export const renewalScheduler = new RenewalScheduler();
