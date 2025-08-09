-- Nginx Proxy Manager Database Initialization
-- This script will be executed when the MySQL container starts for the first time

USE nginx_proxy_manager;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create proxies table
CREATE TABLE IF NOT EXISTS proxies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  domain VARCHAR(255) UNIQUE NOT NULL,
  target VARCHAR(500) NOT NULL,
  ssl_enabled BOOLEAN DEFAULT FALSE,
  status ENUM('active', 'inactive', 'error') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_proxies_user_id (user_id),
  INDEX idx_proxies_domain (domain)
);

-- Create ssl_certificates table
CREATE TABLE IF NOT EXISTS ssl_certificates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proxy_id INT NOT NULL,
  domain VARCHAR(255) NOT NULL,
  cert_path VARCHAR(500),
  key_path VARCHAR(500),
  expires_at DATETIME,
  last_renewed DATETIME,
  status ENUM('active', 'expired', 'pending', 'error') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ssl_proxy_id (proxy_id),
  INDEX idx_ssl_domain (domain),
  INDEX idx_ssl_expires (expires_at)
);

-- Create renewal_logs table
CREATE TABLE IF NOT EXISTS renewal_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  status ENUM('success', 'failed') NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_renewal_domain (domain),
  INDEX idx_renewal_created (created_at)
);

-- Insert default admin user
-- Password: admin123 (hashed with bcrypt)
INSERT IGNORE INTO users (email, password_hash, name) VALUES 
('admin@example.com', '$2b$10$rQZ8kHWKtGY5uFQNXvXxUeJ4vQZ8kHWKtGY5uFQNXvXxUeJ4vQZ8k', 'Administrator');

-- Insert sample proxy configurations for demonstration
INSERT IGNORE INTO proxies (user_id, domain, target, ssl_enabled, status) VALUES 
(1, 'app.example.com', 'http://localhost:3000', true, 'active'),
(1, 'api.example.com', 'http://localhost:8080', true, 'active');

-- Insert sample SSL certificates
INSERT IGNORE INTO ssl_certificates (proxy_id, domain, status, expires_at) VALUES 
(1, 'app.example.com', 'pending', DATE_ADD(NOW(), INTERVAL 90 DAY)),
(2, 'api.example.com', 'pending', DATE_ADD(NOW(), INTERVAL 90 DAY));

COMMIT;