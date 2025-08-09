-- Add first_login column to users table to track if user needs to change password
ALTER TABLE users ADD COLUMN first_login BOOLEAN DEFAULT TRUE;

-- Update existing users to have first_login = FALSE (they've already logged in)
UPDATE users SET first_login = FALSE WHERE id > 0;