import { exec } from "child_process";
import http from "http";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { pool } from "../config/database.js";
import nginxGenerator from "./nginxGenerator.js";
import { logError } from "../utils/errorHandler.js";

const execAsync = promisify(exec);

export interface CertificateInfo {
  domain: string; // primary domain
  domains?: string[]; // SAN list including primary
  status: "pending" | "valid" | "expired" | "failed";
  issued_at?: Date;
  expires_at?: Date;
}

class CertbotService {
  private certbotPath = process.env.CERTBOT_PATH || "certbot";
  private configDir = process.env.CERTBOT_CONFIG_DIR || "/etc/letsencrypt";
  private workDir = process.env.CERTBOT_WORK_DIR || "/var/lib/letsencrypt";
  private logsDir = process.env.CERTBOT_LOGS_DIR || "/var/log/letsencrypt";
  private webroot = process.env.CERTBOT_WEBROOT || "/var/www/certbot";

  async checkCertbotInstallation(): Promise<boolean> {
    try {
      await execAsync(`${this.certbotPath} --version`);
      return true;
    } catch {
      return false;
    }
  }

  async initDirs(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.mkdir(this.workDir, { recursive: true });
    await fs.mkdir(this.logsDir, { recursive: true });
    await fs.mkdir(this.webroot, { recursive: true });
  }

  private async generateAcmeConfig(
    primary: string,
    domains: string[]
  ): Promise<void> {
    const serverNames = domains.join(" ");
    const contents = `# ACME temporary config for ${serverNames}\nserver {\n  listen 80;\n  server_name ${serverNames};\n  location /.well-known/acme-challenge/ {\n    root ${this.webroot};\n    try_files $uri =404;\n  }\n  location / { return 301 https://$host$request_uri; }\n}`;
    const configPath = path.join(
      "/etc/nginx/sites-available",
      `${primary}-acme.conf`
    );
    const enabledPath = path.join(
      "/etc/nginx/sites-enabled",
      `${primary}-acme.conf`
    );
    await fs.writeFile(configPath, contents, "utf8");
    try {
      await fs.unlink(enabledPath);
    } catch {
      /* ignore missing */
    }
    await fs.symlink(configPath, enabledPath);
    await execAsync("nginx -s reload");
  }

  private async removeAcmeConfig(primary: string): Promise<void> {
    try {
      const configPath = path.join(
        "/etc/nginx/sites-available",
        `${primary}-acme.conf`
      );
      const enabledPath = path.join(
        "/etc/nginx/sites-enabled",
        `${primary}-acme.conf`
      );
      await fs.unlink(enabledPath);
      await fs.unlink(configPath);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err && err.code !== "ENOENT")
        logError("ACME cleanup error", err.message || String(err));
    }
  }

  private mapStatus(
    raw: "pending" | "valid" | "expired" | "failed"
  ): CertificateInfo["status"] {
    return raw; // pass-through, align with DB statuses
  }

  async obtainCertificate(
    primary: string,
    extraDomains: string[] = [],
    email?: string
  ): Promise<CertificateInfo> {
    const domains = [
      primary,
      ...extraDomains.filter((d) => d && d !== primary),
    ].filter((v, i, a) => a.indexOf(v) === i);
    if (!(await this.checkCertbotInstallation()))
      throw new Error("Certbot not installed");
    await this.initDirs();
    await this.generateAcmeConfig(primary, domains);
    try {
      const emailFlag = email
        ? `--email ${email}`
        : "--register-unsafely-without-email";
      const domainFlags = domains.map((d) => `-d ${d}`).join(" ");
      const cmd = `${this.certbotPath} certonly --webroot -w ${this.webroot} ${domainFlags} ${emailFlag} --agree-tos --non-interactive --expand --config-dir ${this.configDir} --work-dir ${this.workDir} --logs-dir ${this.logsDir}`;
      const { stdout, stderr } = await execAsync(cmd);
      if (stdout) console.log(stdout);
      if (stderr) console.log(stderr);
      const info = await this.getCertificateInfo(primary, domains);
      if (info.status !== "valid") throw new Error("Certificate not valid");
      await this.persist(primary, info);
      await this.enableProxySSL(primary);
      return info;
    } catch (e) {
      await this.persist(primary, {
        domain: primary,
        domains,
        status: "failed",
      });
      throw e;
    } finally {
      await this.removeAcmeConfig(primary);
    }
  }

  async getCertificateInfo(
    primary: string,
    domains?: string[]
  ): Promise<CertificateInfo> {
    try {
      const certPath = path.join(
        this.configDir,
        "live",
        primary,
        "fullchain.pem"
      );
      try {
        await fs.access(certPath);
      } catch {
        return {
          domain: primary,
          domains: domains || [primary],
          status: "pending",
        };
      }
      const { stdout } = await execAsync(
        `openssl x509 -in ${certPath} -noout -dates`
      );
      let issued_at: Date | undefined;
      let expires_at: Date | undefined;
      stdout.split("\n").forEach((line) => {
        if (line.startsWith("notBefore=")) issued_at = new Date(line.slice(10));
        else if (line.startsWith("notAfter="))
          expires_at = new Date(line.slice(9));
      });
      const raw: "valid" | "expired" =
        expires_at && expires_at.getTime() < Date.now() ? "expired" : "valid";
      return {
        domain: primary,
        domains: domains || [primary],
        status: raw,
        issued_at,
        expires_at,
      };
    } catch (e) {
      logError(
        "getCertificateInfo failed",
        e instanceof Error ? e.message : String(e)
      );
      return {
        domain: primary,
        domains: domains || [primary],
        status: "failed",
      };
    }
  }

  async renew(primary: string): Promise<CertificateInfo> {
    const cmd = `${this.certbotPath} renew --cert-name ${primary} --non-interactive --config-dir ${this.configDir} --work-dir ${this.workDir} --logs-dir ${this.logsDir}`;
    const { stdout, stderr } = await execAsync(cmd);
    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);
    const info = await this.getCertificateInfo(primary);
    await this.persist(primary, info);
    if (info.status === "valid") await execAsync("nginx -s reload");
    return info;
  }

  private async persist(primary: string, info: CertificateInfo): Promise<void> {
    const conn = await pool.getConnection();
    try {
      const [pRows] = await conn.execute(
        "SELECT id FROM proxies WHERE domain = ?",
        [primary]
      );
      const proxy = (pRows as { id: number }[])[0];
      if (!proxy) return;
      const proxyId = proxy.id;
      const [cRows] = await conn.execute(
        "SELECT id FROM ssl_certificates WHERE proxy_id = ? ORDER BY created_at DESC LIMIT 1",
        [proxyId]
      );
      const existing = (cRows as { id: number }[])[0];
      let certId: number;
      if (existing) {
        certId = existing.id;
        await conn.execute(
          "UPDATE ssl_certificates SET status=?, expires_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
          [info.status, info.expires_at || null, certId]
        );
      } else {
        const [ins] = await conn.execute(
          "INSERT INTO ssl_certificates (proxy_id, domain, status, expires_at) VALUES (?,?,?,?)",
          [proxyId, primary, info.status, info.expires_at || null]
        );
        certId = (ins as { insertId: number }).insertId;
      }
      if (info.domains && info.domains.length) {
        await conn.execute(
          "DELETE scd FROM ssl_certificate_domains scd JOIN ssl_certificates sc ON scd.certificate_id=sc.id WHERE sc.proxy_id=?",
          [proxyId]
        );
        for (const d of info.domains) {
          await conn.execute(
            "INSERT IGNORE INTO ssl_certificate_domains (certificate_id, domain) VALUES (?,?)",
            [certId, d]
          );
        }
      }
    } finally {
      conn.release();
    }
  }

  private async enableProxySSL(primary: string): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        "UPDATE proxies SET ssl_enabled = 1 WHERE domain = ?",
        [primary]
      );
      const [rows] = await conn.execute(
        "SELECT id, domain, target, ssl_enabled, status, created_at, updated_at FROM proxies WHERE domain = ?",
        [primary]
      );
      type ProxyRow = {
        id: number;
        domain: string;
        target: string;
        ssl_enabled: number;
        status: string;
      };
      const proxy = (rows as ProxyRow[])[0];
      if (proxy) {
        const url = new URL(proxy.target);
        await nginxGenerator.writeProxyConfig({
          id: proxy.id,
          domain: proxy.domain,
          target_host: url.hostname,
          target_port: parseInt(url.port) || 80,
          ssl_enabled: true,
          status: proxy.status,
        });
        await nginxGenerator.reloadNginx();
      }
    } finally {
      conn.release();
    }
  }

  async revoke(primary: string): Promise<void> {
    const certPath = path.join(
      this.configDir,
      "live",
      primary,
      "fullchain.pem"
    );
    try {
      await fs.access(certPath);
    } catch {
      return;
    }
    const cmd = `${this.certbotPath} revoke --cert-path ${certPath} --non-interactive --config-dir ${this.configDir} --work-dir ${this.workDir} --logs-dir ${this.logsDir}`;
    await execAsync(cmd);
    await this.persist(primary, { domain: primary, status: "failed" });
  }

  async testDomain(
    domain: string,
    timeoutMs = 4000
  ): Promise<{
    domain: string;
    reachable: boolean;
    statusCode?: number;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const req = http.get(
        { host: domain, path: "/", port: 80, timeout: timeoutMs },
        (res) => {
          res.resume();
          resolve({ domain, reachable: true, statusCode: res.statusCode });
        }
      );
      req.on("timeout", () => {
        req.destroy();
        resolve({ domain, reachable: false, error: "timeout" });
      });
      req.on("error", (err) =>
        resolve({ domain, reachable: false, error: err.message })
      );
    });
  }
}

export default new CertbotService();
