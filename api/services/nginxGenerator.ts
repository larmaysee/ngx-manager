/**
 * Nginx Configuration Generator Service
 * Generates nginx configuration files for proxy configurations
 */
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { pool } from "../config/database.js";
import { logError } from "../utils/errorHandler.js";

const execAsync = promisify(exec);

interface ProxyConfig {
  id: number;
  domain: string;
  target_host: string;
  target_port: number;
  ssl_enabled: boolean;
  status: string;
}

class NginxGenerator {
  private configDir: string;
  private sitesAvailable: string;
  private sitesEnabled: string;

  constructor() {
    // In Docker environment, nginx config will be mounted
    this.configDir = process.env.NGINX_CONFIG_DIR || "/etc/nginx";
    this.sitesAvailable = path.join(this.configDir, "sites-available");
    this.sitesEnabled = path.join(this.configDir, "sites-enabled");
  }

  /**
   * Generate nginx configuration for a single proxy
   */
  private generateProxyConfig(proxy: ProxyConfig): string {
    const { domain, target_host, target_port, ssl_enabled } = proxy;

    let config = `# Proxy configuration for ${domain}\n`;
    config += `# Generated automatically - do not edit manually\n\n`;

    if (ssl_enabled) {
      // HTTPS configuration
      config += `server {\n`;
      config += `    listen 80;\n`;
      config += `    server_name ${domain};\n`;
      config += `    return 301 https://$server_name$request_uri;\n`;
      config += `}\n\n`;

      config += `server {\n`;
      config += `    listen 443 ssl;\n`;
      config += `    http2 on;\n`;
      config += `    server_name ${domain};\n\n`;

      config += `    # SSL Configuration\n`;
      config += `    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;\n`;
      config += `    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;\n`;
      config += `    ssl_protocols TLSv1.2 TLSv1.3;\n`;
      config += `    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;\n`;
      config += `    ssl_prefer_server_ciphers off;\n`;
      config += `    ssl_session_cache shared:SSL:10m;\n`;
      config += `    ssl_session_timeout 10m;\n\n`;

      config += `    # Security headers\n`;
      config += `    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n`;
      config += `    add_header X-Frame-Options DENY always;\n`;
      config += `    add_header X-Content-Type-Options nosniff always;\n`;
      config += `    add_header X-XSS-Protection "1; mode=block" always;\n\n`;
    } else {
      // HTTP only configuration
      config += `server {\n`;
      config += `    listen 80;\n`;
      config += `    server_name ${domain};\n\n`;
    }

    // Common proxy configuration
    config += `    # Proxy configuration\n`;
    config += `    location / {\n`;
    config += `        proxy_pass http://${target_host}:${target_port};\n`;
    config += `        proxy_set_header Host $host;\n`;
    config += `        proxy_set_header X-Real-IP $remote_addr;\n`;
    config += `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n`;
    config += `        proxy_set_header X-Forwarded-Proto $scheme;\n`;
    config += `        proxy_set_header X-Forwarded-Host $host;\n`;
    config += `        proxy_set_header X-Forwarded-Port $server_port;\n\n`;

    config += `        # Proxy timeouts\n`;
    config += `        proxy_connect_timeout 60s;\n`;
    config += `        proxy_send_timeout 60s;\n`;
    config += `        proxy_read_timeout 60s;\n\n`;

    config += `        # Buffer settings\n`;
    config += `        proxy_buffering on;\n`;
    config += `        proxy_buffer_size 128k;\n`;
    config += `        proxy_buffers 4 256k;\n`;
    config += `        proxy_busy_buffers_size 256k;\n\n`;

    config += `        # WebSocket support\n`;
    config += `        proxy_http_version 1.1;\n`;
    config += `        proxy_set_header Upgrade $http_upgrade;\n`;
    config += `        proxy_set_header Connection "upgrade";\n`;
    config += `    }\n\n`;

    config += `    # Health check endpoint\n`;
    config += `    location /nginx-health {\n`;
    config += `        access_log off;\n`;
    config += `        return 200 "healthy\\n";\n`;
    config += `        add_header Content-Type text/plain;\n`;
    config += `    }\n`;

    config += `}\n`;

    return config;
  }

  /**
   * Write configuration file for a proxy
   */
  async writeProxyConfig(proxy: ProxyConfig): Promise<void> {
    try {
      const config = this.generateProxyConfig(proxy);
      const filename = `${proxy.domain}.conf`;
      const filePath = path.join(this.sitesAvailable, filename);

      // Ensure directories exist
      await fs.mkdir(this.sitesAvailable, { recursive: true });
      await fs.mkdir(this.sitesEnabled, { recursive: true });

      // Write configuration file
      await fs.writeFile(filePath, config, "utf8");

      // Enable the site if proxy is active
      if (proxy.status === "active") {
        await this.enableSite(proxy.domain);
      } else {
        await this.disableSite(proxy.domain);
      }

      console.log(`Generated nginx config for ${proxy.domain}`);
    } catch (error) {
      logError(`Error writing nginx config for ${proxy.domain}:`, error);
      throw error;
    }
  }

  /**
   * Enable a site by creating symlink
   */
  async enableSite(domain: string): Promise<void> {
    try {
      const availablePath = path.join(this.sitesAvailable, `${domain}.conf`);
      const enabledPath = path.join(this.sitesEnabled, `${domain}.conf`);

      // Remove existing symlink if it exists
      try {
        await fs.unlink(enabledPath);
      } catch {
        // Ignore if file doesn't exist
      }

      // Create symlink
      await fs.symlink(availablePath, enabledPath);
      console.log(`Enabled site: ${domain}`);
    } catch (error) {
      logError(`Error enabling site ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Disable a site by removing symlink
   */
  async disableSite(domain: string): Promise<void> {
    try {
      const enabledPath = path.join(this.sitesEnabled, `${domain}.conf`);
      await fs.unlink(enabledPath);
      console.log(`Disabled site: ${domain}`);
    } catch (error) {
      // Ignore if file doesn't exist
      if (error.code !== "ENOENT") {
        logError(`Error disabling site ${domain}:`, error);
        throw error;
      }
    }
  }

  /**
   * Remove configuration files for a proxy
   */
  async removeProxyConfig(domain: string): Promise<void> {
    try {
      // Disable site first
      await this.disableSite(domain);

      // Remove configuration file
      const filePath = path.join(this.sitesAvailable, `${domain}.conf`);
      await fs.unlink(filePath);

      console.log(`Removed nginx config for ${domain}`);
    } catch (error) {
      if (error.code !== "ENOENT") {
        logError(`Error removing nginx config for ${domain}:`, error);
        throw error;
      }
    }
  }

  /**
   * Reload nginx configuration
   */
  async reloadNginx(): Promise<void> {
    try {
      // Test nginx configuration first
      await execAsync("nginx -t");

      // Reload nginx
      await execAsync("nginx -s reload");

      console.log("Nginx configuration reloaded successfully");
    } catch (error) {
      logError("Error reloading nginx:", error);
      throw new Error(`Failed to reload nginx: ${error.message}`);
    }
  }

  /**
   * Generate all proxy configurations from database
   */
  async generateAllConfigs(): Promise<void> {
    try {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          "SELECT id, domain, target_host, target_port, ssl_enabled, status FROM proxies"
        );

        const proxies = rows as ProxyConfig[];

        // Generate config for each proxy
        for (const proxy of proxies) {
          await this.writeProxyConfig(proxy);
        }

        // Reload nginx after generating all configs
        await this.reloadNginx();

        console.log(`Generated ${proxies.length} nginx configurations`);
      } finally {
        connection.release();
      }
    } catch (error) {
      logError("Error generating all nginx configs:", error);
      throw error;
    }
  }

  /**
   * Clean up orphaned configuration files
   */
  async cleanupOrphanedConfigs(): Promise<void> {
    try {
      const connection = await pool.getConnection();
      try {
        // Get all domains from database
        const [rows] = await connection.execute("SELECT domain FROM proxies");

        const activeDomains = new Set(
          (rows as { domain: string }[]).map((row) => row.domain)
        );

        // Get all config files
        const configFiles = await fs.readdir(this.sitesAvailable);

        // Remove configs for domains that no longer exist
        for (const file of configFiles) {
          if (file.endsWith(".conf")) {
            const domain = file.replace(".conf", "");
            if (!activeDomains.has(domain)) {
              await this.removeProxyConfig(domain);
              console.log(`Cleaned up orphaned config: ${domain}`);
            }
          }
        }
      } finally {
        connection.release();
      }
    } catch (error) {
      logError("Error cleaning up orphaned configs:", error);
      throw error;
    }
  }
}

export default new NginxGenerator();
