/**
 * Database configuration and connection setup
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { logError } from '../utils/errorHandler';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nginx_proxy_manager',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Create connection pool
export const pool = mysql.createPool(dbConfig);

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    logError('❌ Database connection failed:', error);
    return false;
  }
}

// Initialize database schema
export async function initializeDatabase(): Promise<void> {
  try {
    // Create database if it doesn't exist
    const tempPool = mysql.createPool({
      ...dbConfig,
      database: undefined, // Connect without specifying database
    });

    await tempPool.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    await tempPool.end();

    console.log(`✅ Database '${dbConfig.database}' created/verified`);

    // Create tables
    await createTables();
    
    // Run pending migrations
    await runMigrations();
  } catch (error) {
    logError('❌ Database initialization failed:', error);
    throw error;
  }
}

// Create database tables
async function createTables(): Promise<void> {
  const connection = await pool.getConnection();

  try {
    // Users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        first_login BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create index for users email (with error handling for older MySQL versions)
    try {
      await connection.execute(`CREATE INDEX idx_users_email ON users(email)`);
    } catch (error: any) {
      // Index might already exist, ignore duplicate key error
      if (!error.message.includes('Duplicate key name')) {
        logError('Warning creating users email index:', error.message);
      }
    }

    // Proxies table
    await connection.execute(`
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
      )
    `);

    // SSL Certificates table
    await connection.execute(`
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
      )
    `);

    // Migrations tracking table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('success', 'failed') DEFAULT 'success',
        error_message TEXT NULL,
        INDEX idx_migrations_filename (filename),
        INDEX idx_migrations_executed_at (executed_at)
      )
    `);

    console.log('✅ Database tables created/verified');

    // Insert default admin user if not exists
    await insertDefaultData(connection);

  } finally {
    connection.release();
  }
}

// Insert default data
async function insertDefaultData(connection: mysql.PoolConnection): Promise<void> {
  try {
    // Get default user credentials from environment variables
    const defaultEmail = process.env.DEFAULT_USER_EMAIL || 'admin@example.com';
    const defaultPassword = process.env.DEFAULT_USER_PASSWORD || 'admin123';
    const defaultName = process.env.DEFAULT_USER_NAME || 'Administrator';

    // Check if admin user exists
    const [rows] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [defaultEmail]
    );

    if ((rows as any[]).length === 0) {
      // Hash the password programmatically
      const saltRounds = 10;
      const defaultPasswordHash = await bcrypt.hash(defaultPassword, saltRounds);

      await connection.execute(
        'INSERT INTO users (email, password_hash, name, first_login) VALUES (?, ?, ?, ?)',
        [defaultEmail, defaultPasswordHash, defaultName, true]
      );

      console.log(`✅ Default admin user created (${defaultEmail} / ${defaultPassword})`);
    }
  } catch (error: any) {
    logError('❌ Failed to insert default data:', error.message || error);
  }
}

// Migration runner functions
export async function runMigrations(): Promise<void> {
  try {
    const migrationsDir = path.join(process.cwd(), 'migrations');
    
    // Check if migrations directory exists
    try {
      await fs.access(migrationsDir);
    } catch {
      console.log('📁 No migrations directory found, skipping migrations');
      return;
    }

    // Get all SQL files from migrations directory
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure consistent execution order

    if (sqlFiles.length === 0) {
      console.log('📁 No migration files found');
      return;
    }

    console.log(`🔄 Found ${sqlFiles.length} migration files`);

    // Get already executed migrations
    const connection = await pool.getConnection();
    try {
      const [executedRows] = await connection.execute(
        'SELECT filename FROM migrations WHERE status = "success"'
      );
      const executedMigrations = (executedRows as any[]).map(row => row.filename);

      // Filter out already executed migrations
      const pendingMigrations = sqlFiles.filter(file => !executedMigrations.includes(file));

      if (pendingMigrations.length === 0) {
        console.log('✅ All migrations are up to date');
        return;
      }

      console.log(`🔄 Running ${pendingMigrations.length} pending migrations`);

      // Execute pending migrations
      for (const filename of pendingMigrations) {
        await executeMigration(connection, migrationsDir, filename);
      }

      console.log('✅ All migrations completed successfully');
    } finally {
      connection.release();
    }
  } catch (error: any) {
    logError('❌ Migration execution failed:', error.message || error);
    throw error;
  }
}

async function executeMigration(
  connection: mysql.PoolConnection,
  migrationsDir: string,
  filename: string
): Promise<void> {
  try {
    console.log(`🔄 Executing migration: ${filename}`);

    // Read migration file
    const filePath = path.join(migrationsDir, filename);
    const migrationSQL = await fs.readFile(filePath, 'utf8');

    // Split SQL statements by semicolon and filter out empty statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.execute(statement);
      }
    }

    // Record successful migration
    await connection.execute(
      'INSERT INTO migrations (filename, status) VALUES (?, "success")',
      [filename]
    );

    console.log(`✅ Migration completed: ${filename}`);
  } catch (error) {
    logError(`❌ Migration failed: ${filename}`, error);

    // Record failed migration
    try {
      await connection.execute(
        'INSERT INTO migrations (filename, status, error_message) VALUES (?, "failed", ?)',
        [filename, error instanceof Error ? error.message : String(error)]
      );
    } catch (recordError) {
      logError('❌ Failed to record migration error:', recordError);
    }

    throw error;
  }
}

export async function getMigrationStatus(): Promise<any[]> {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT filename, executed_at, status, error_message FROM migrations ORDER BY executed_at DESC'
    );
    return rows as any[];
  } finally {
    connection.release();
  }
}

export default pool;