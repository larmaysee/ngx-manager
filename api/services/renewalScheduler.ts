/**
 * SSL Certificate Auto-Renewal Scheduler
 * Background job system for automatic SSL certificate renewal
 */
import cron from 'node-cron';
import { pool } from '../config/database';
import certbotService from './certbotService';
import { logError } from '../utils/errorHandler';

export class RenewalScheduler {
  private isRunning: boolean = false;
  private cronJob: any = null;

  constructor() {
    console.log('RenewalScheduler initialized');
  }

  /**
   * Start the renewal scheduler
   * Runs daily at 2:00 AM to check for certificates that need renewal
   */
  start(): void {
    if (this.isRunning) {
      console.log('Renewal scheduler is already running');
      return;
    }

    // Schedule to run daily at 2:00 AM
    this.cronJob = cron.schedule('0 2 * * *', async () => {
      console.log('Running SSL certificate renewal check...');
      await this.checkAndRenewCertificates();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.isRunning = true;
    console.log('SSL certificate renewal scheduler started (runs daily at 2:00 AM UTC)');
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
    console.log('SSL certificate renewal scheduler stopped');
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

      const certificates = rows as any[];

      if (certificates.length === 0) {
        console.log('No certificates require renewal at this time');
        return;
      }

      console.log(`Found ${certificates.length} certificate(s) that need renewal`);

      for (const cert of certificates) {
        await this.renewCertificate(cert, connection);
      }

    } catch (error) {
      logError('Error during certificate renewal check:', error);
    } finally {
      connection.release();
    }
  }

  /**
   * Renew a specific certificate
   */
  private async renewCertificate(cert: any, connection: any): Promise<void> {
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

      const [result] = await connection.execute(
        `INSERT INTO ssl_certificates (proxy_id, domain, status, expires_at) 
         VALUES (?, ?, 'pending', ?)`,
        [cert.proxy_id, cert.domain, newExpiresAt]
      );

      const newCertificateId = (result as any).insertId;

      // Attempt to renew the certificate using Certbot
      const success = await certbotService.renewCertificate(cert.domain);

      if (success) {
        // Update certificate status to valid
        await connection.execute(
          `UPDATE ssl_certificates 
           SET status = 'valid', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [newCertificateId]
        );

        console.log(`Successfully renewed certificate for domain: ${cert.domain}`);

        // Log renewal event
        await this.logRenewalEvent(cert.domain, 'success', connection);
      } else {
        // Update certificate status to failed
        await connection.execute(
          `UPDATE ssl_certificates 
           SET status = 'failed', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [newCertificateId]
        );

        logError(`Failed to renew certificate for domain: ${cert.domain}`, new Error('Certificate renewal failed'));

        // Log renewal event
        await this.logRenewalEvent(cert.domain, 'failed', connection);
      }

    } catch (error) {
      logError(`Error renewing certificate for domain ${cert.domain}:`, error);

      // Log renewal event
      await this.logRenewalEvent(cert.domain, 'error', connection);
    }
  }

  /**
   * Log renewal events for monitoring and debugging
   */
  private async logRenewalEvent(domain: string, status: 'success' | 'failed' | 'error', connection: any): Promise<void> {
    try {
      await connection.execute(
        `INSERT INTO renewal_logs (domain, status, created_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [domain, status]
      );
    } catch (error) {
      logError('Error logging renewal event:', error);
    }
  }

  /**
   * Get renewal statistics
   */
  async getRenewalStats(): Promise<any> {
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

      return {
        certificates_expiring_soon: (expiringCerts as any[])[0].count,
        recent_renewals: recentRenewals,
        scheduler_running: this.isRunning
      };
    } finally {
      connection.release();
    }
  }

  /**
   * Force renewal check (for testing or manual trigger)
   */
  async forceRenewalCheck(): Promise<void> {
    console.log('Manual renewal check triggered');
    await this.checkAndRenewCertificates();
  }
}

// Export singleton instance
export const renewalScheduler = new RenewalScheduler();