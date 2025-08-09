-- Create password_history table to prevent password reuse
CREATE TABLE IF NOT EXISTS password_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

-- Add password_changed_at column to users table for tracking last password change
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP NULL;

-- Update existing users to set password_changed_at to created_at
UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL;