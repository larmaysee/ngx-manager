-- Create table to store multiple domains (SANs) for a single SSL certificate
CREATE TABLE IF NOT EXISTS ssl_certificate_domains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  certificate_id INT NOT NULL,
  domain VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_certificate_domain (certificate_id, domain),
  INDEX idx_domain (domain),
  CONSTRAINT fk_ssl_certificate_domains_cert FOREIGN KEY (certificate_id) REFERENCES ssl_certificates(id) ON DELETE CASCADE
);
