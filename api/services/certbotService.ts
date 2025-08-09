/**
 * Let's Encrypt Certbot Integration Service
 * Handles automatic SSL certificate provisioning and management
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { pool } from '../config/database';
import nginxGenerator from './nginxGenerator';
import { logError } from '../utils/errorHandler';

const execAsync = promisify(exec);

interface CertificateInfo {
  domain: string;
  status: 'pending' | 'valid' | 'expired' | 'failed';
  issued_at?: Date;
  expires_at?: Date;
  last_renewal_attempt?: Date;
  renewal_status?: 'success' | 'failed';
}

class CertbotService {
  private certbotPath: string;
  private configDir: string;
  private workDir: string;
  private logsDir: string;
  private webroot: string;

  constructor() {
    this.certbotPath = process.env.CERTBOT_PATH || 'certbot';
    this.configDir = process.env.CERTBOT_CONFIG_DIR || '/etc/letsencrypt';
    this.workDir = process.env.CERTBOT_WORK_DIR || '/var/lib/letsencrypt';
    this.logsDir = process.env.CERTBOT_LOGS_DIR || '/var/log/letsencrypt';
    this.webroot = process.env.CERTBOT_WEBROOT || '/var/www/certbot';
  }

  /**
   * Check if certbot is installed and accessible
   */
  async checkCertbotInstallation(): Promise<boolean> {
    try {
      await execAsync(`${this.certbotPath} --version`);
      return true;
    } catch (error) {
      logError('Certbot not found or not accessible:', (error as Error).message);
      return false;
    }
  }

  /**
   * Initialize certbot directories
   */
  async initializeCertbot(): Promise<void> {
    try {
      // Create necessary directories
      await fs.mkdir(this.configDir, { recursive: true });
      await fs.mkdir(this.workDir, { recursive: true });
      await fs.mkdir(this.logsDir, { recursive: true });
      await fs.mkdir(this.webroot, { recursive: true });

      console.log('Certbot directories initialized');
    } catch (error) {
      logError('Error initializing certbot directories:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Generate temporary nginx config for ACME challenge
   */
  private async generateAcmeConfig(domain: string): Promise<void> {
    const config = `# Temporary config for ACME challenge - ${domain}\n`;
    const configContent = `server {\n` +
      `    listen 80;\n` +
      `    server_name ${domain};\n\n` +
      `    # ACME challenge location\n` +
      `    location /.well-known/acme-challenge/ {\n` +
      `        root ${this.webroot};\n` +
      `        try_files $uri =404;\n` +
      `    }\n\n` +
      `    # Redirect all other traffic to HTTPS (after cert is obtained)\n` +
      `    location / {\n` +
      `        return 301 https://$server_name$request_uri;\n` +
      `    }\n` +
      `}\n`;

    const configPath = path.join('/etc/nginx/sites-available', `${domain}-acme.conf`);
    const enabledPath = path.join('/etc/nginx/sites-enabled', `${domain}-acme.conf`);

    await fs.writeFile(configPath, config + configContent, 'utf8');

    // Enable the temporary config
    try {
      await fs.unlink(enabledPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }

    await fs.symlink(configPath, enabledPath);

    // Reload nginx
    await execAsync('nginx -s reload');
  }

  /**
   * Remove temporary ACME configuration
   */
  private async removeAcmeConfig(domain: string): Promise<void> {
    try {
      const configPath = path.join('/etc/nginx/sites-available', `${domain}-acme.conf`);
      const enabledPath = path.join('/etc/nginx/sites-enabled', `${domain}-acme.conf`);

      await fs.unlink(enabledPath);
      await fs.unlink(configPath);

      console.log(`Removed temporary ACME config for ${domain}`);
    } catch (error) {
      // Ignore if files don't exist
      if (error.code !== 'ENOENT') {
        logError(`Error removing ACME config for ${domain}:`, (error as Error).message);
      }
    }
  }

  /**
   * Obtain SSL certificate for a domain
   */
  async obtainCertificate(domain: string, email?: string): Promise<CertificateInfo> {
    try {
      console.log(`Starting certificate generation for ${domain}`);

      // Check if certbot is available
      const certbotAvailable = await this.checkCertbotInstallation();
      if (!certbotAvailable) {
        throw new Error('Certbot is not installed or accessible');
      }

      // Initialize certbot if needed
      await this.initializeCertbot();

      // Generate temporary nginx config for ACME challenge
      await this.generateAcmeConfig(domain);

      // Build certbot command
      const emailFlag = email ? `--email ${email}` : '--register-unsafely-without-email';
      const command = [
        this.certbotPath,
        'certonly',
        '--webroot',
        `-w ${this.webroot}`,
        `-d ${domain}`,
        emailFlag,
        '--agree-tos',
        '--non-interactive',
        '--expand',
        `--config-dir ${this.configDir}`,
        `--work-dir ${this.workDir}`,
        `--logs-dir ${this.logsDir}`
      ].join(' ');

      console.log(`Executing certbot command: ${command}`);

      // Execute certbot
      const { stdout, stderr } = await execAsync(command);

      console.log('Certbot stdout:', stdout);
      if (stderr) {
        console.log('Certbot stderr:', stderr);
      }

      // Remove temporary ACME config
      await this.removeAcmeConfig(domain);

      // Verify certificate was created
      const certInfo = await this.getCertificateInfo(domain);

      if (certInfo.status === 'valid') {
        // Update database
        await this.updateCertificateInDatabase(domain, certInfo);

        // Regenerate nginx config with SSL
        await this.updateProxyWithSSL(domain);

        console.log(`Certificate successfully obtained for ${domain}`);
        return certInfo;
      } else {
        throw new Error('Certificate generation failed - certificate not found');
      }

    } catch (error) {
      logError(`Error obtaining certificate for ${domain}:`, (error as Error).message);

      // Clean up temporary config
      await this.removeAcmeConfig(domain);

      // Update database with failed status
      await this.updateCertificateInDatabase(domain, {
        domain,
        status: 'failed',
        last_renewal_attempt: new Date(),
        renewal_status: 'failed'
      });

      throw error;
    }
  }

  /**
   * Get certificate information from filesystem
   */
  async getCertificateInfo(domain: string): Promise<CertificateInfo> {
    try {
      const certPath = path.join(this.configDir, 'live', domain, 'fullchain.pem');

      // Check if certificate exists
      try {
        await fs.access(certPath);
      } catch (error) {
        return {
          domain,
          status: 'pending'
        };
      }

      // Get certificate details using openssl
      const command = `openssl x509 -in ${certPath} -noout -dates`;
      const { stdout } = await execAsync(command);

      const lines = stdout.split('\n');
      let issued_at: Date | undefined;
      let expires_at: Date | undefined;

      for (const line of lines) {
        if (line.startsWith('notBefore=')) {
          issued_at = new Date(line.replace('notBefore=', ''));
        } else if (line.startsWith('notAfter=')) {
          expires_at = new Date(line.replace('notAfter=', ''));
        }
      }

      // Determine status
      const now = new Date();
      let status: 'pending' | 'valid' | 'expired' | 'failed' = 'valid';

      if (expires_at && expires_at < now) {
        status = 'expired';
      }

      return {
        domain,
        status,
        issued_at,
        expires_at
      };

    } catch (error) {
      logError(`Error getting certificate info for ${domain}:`, (error as Error).message);
      return {
        domain,
        status: 'failed'
      };
    }
  }

  /**
   * Renew certificate for a domain
   */
  async renewCertificate(domain: string): Promise<CertificateInfo> {
    try {
      console.log(`Starting certificate renewal for ${domain}`);

      // Build renewal command
      const command = [
        this.certbotPath,
        'renew',
        `--cert-name ${domain}`,
        '--non-interactive',
        `--config-dir ${this.configDir}`,
        `--work-dir ${this.workDir}`,
        `--logs-dir ${this.logsDir}`
      ].join(' ');

      console.log(`Executing renewal command: ${command}`);

      // Execute renewal
      const { stdout, stderr } = await execAsync(command);

      console.log('Renewal stdout:', stdout);
      if (stderr) {
        console.log('Renewal stderr:', stderr);
      }

      // Get updated certificate info
      const certInfo = await this.getCertificateInfo(domain);

      // Update database
      await this.updateCertificateInDatabase(domain, {
        ...certInfo,
        last_renewal_attempt: new Date(),
        renewal_status: certInfo.status === 'valid' ? 'success' : 'failed'
      });

      // Reload nginx if renewal was successful
      if (certInfo.status === 'valid') {
        await execAsync('nginx -s reload');
        console.log(`Certificate successfully renewed for ${domain}`);
      }

      return certInfo;

    } catch (error) {
      logError(`Error renewing certificate for ${domain}:`, (error as Error).message);

      // Update database with failed renewal
      await this.updateCertificateInDatabase(domain, {
        domain,
        status: 'failed',
        last_renewal_attempt: new Date(),
        renewal_status: 'failed'
      });

      throw error;
    }
  }

  /**
   * Update certificate information in database
   */
  private async updateCertificateInDatabase(domain: string, certInfo: CertificateInfo): Promise<void> {
    try {
      const connection = await pool.getConnection();
      try {
        // Get proxy ID for this domain
        const [proxyRows] = await connection.execute(
          'SELECT id FROM proxies WHERE domain = ?',
          [domain]
        );

        const proxies = proxyRows as any[];
        if (proxies.length === 0) {
          logError(`No proxy found for domain ${domain}`, 'Proxy not found');
          return;
        }

        const proxyId = proxies[0].id;

        // Check if certificate record exists
        const [certRows] = await connection.execute(
          'SELECT id FROM ssl_certificates WHERE proxy_id = ?',
          [proxyId]
        );

        const certificates = certRows as any[];

        if (certificates.length > 0) {
          // Update existing record
          await connection.execute(
            `UPDATE ssl_certificates 
             SET status = ?, issued_at = ?, expires_at = ?, 
                 last_renewal_attempt = ?, renewal_status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE proxy_id = ?`,
            [
              certInfo.status,
              certInfo.issued_at || null,
              certInfo.expires_at || null,
              certInfo.last_renewal_attempt || null,
              certInfo.renewal_status || null,
              proxyId
            ]
          );
        } else {
          // Create new record
          await connection.execute(
            `INSERT INTO ssl_certificates 
             (proxy_id, status, issued_at, expires_at, last_renewal_attempt, renewal_status) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              proxyId,
              certInfo.status,
              certInfo.issued_at || null,
              certInfo.expires_at || null,
              certInfo.last_renewal_attempt || null,
              certInfo.renewal_status || null
            ]
          );
        }

        console.log(`Updated certificate record for ${domain}`);
      } finally {
        connection.release();
      }
    } catch (error) {
      logError(`Error updating certificate in database for ${domain}:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * Update proxy configuration to enable SSL
   */
  private async updateProxyWithSSL(domain: string): Promise<void> {
    try {
      const connection = await pool.getConnection();
      try {
        // Enable SSL for the proxy
        await connection.execute(
          'UPDATE proxies SET ssl_enabled = true WHERE domain = ?',
          [domain]
        );

        // Get updated proxy info
        const [rows] = await connection.execute(
          'SELECT id, domain, target_host, target_port, ssl_enabled, status FROM proxies WHERE domain = ?',
          [domain]
        );

        const proxies = rows as any[];
        if (proxies.length > 0) {
          // Regenerate nginx config with SSL
          await nginxGenerator.writeProxyConfig(proxies[0]);
          await nginxGenerator.reloadNginx();

          console.log(`Updated proxy configuration with SSL for ${domain}`);
        }
      } finally {
        connection.release();
      }
    } catch (error) {
      logError(`Error updating proxy with SSL for ${domain}:`, (error as Error).message);
      throw error;
    }
  }

  /**
   * Get all certificates that need renewal (expire within 30 days)
   */
  async getCertificatesForRenewal(): Promise<string[]> {
    try {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          `SELECT p.domain 
           FROM proxies p 
           JOIN ssl_certificates c ON p.id = c.proxy_id 
           WHERE p.ssl_enabled = true 
           AND c.status = 'valid' 
           AND c.expires_at <= DATE_ADD(NOW(), INTERVAL 30 DAY)`,
          []
        );

        return (rows as any[]).map(row => row.domain);
      } finally {
        connection.release();
      }
    } catch (error) {
      logError('Error getting certificates for renewal:', (error as Error).message);
      return [];
    }
  }

  /**
   * Revoke certificate for a domain
   */
  async revokeCertificate(domain: string): Promise<void> {
    try {
      const certPath = path.join(this.configDir, 'live', domain, 'fullchain.pem');

      // Check if certificate exists
      try {
        await fs.access(certPath);
      } catch (error) {
        console.log(`No certificate found for ${domain}, nothing to revoke`);
        return;
      }

      // Revoke certificate
      const command = [
        this.certbotPath,
        'revoke',
        `--cert-path ${certPath}`,
        '--non-interactive',
        `--config-dir ${this.configDir}`,
        `--work-dir ${this.workDir}`,
        `--logs-dir ${this.logsDir}`
      ].join(' ');

      await execAsync(command);

      // Update database
      await this.updateCertificateInDatabase(domain, {
        domain,
        status: 'failed'
      });

      console.log(`Certificate revoked for ${domain}`);
    } catch (error) {
      logError(`Error revoking certificate for ${domain}:`, (error as Error).message);
      throw error;
    }
  }
}

export default new CertbotService();