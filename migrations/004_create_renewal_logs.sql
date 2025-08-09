-- Create renewal_logs table for tracking SSL certificate renewal events
CREATE TABLE IF NOT EXISTS renewal_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  status ENUM('success', 'failed', 'error') NOT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_domain (domain),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status)
);