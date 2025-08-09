/**
 * Database configuration and connection setup
 */
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { logError } from "../utils/errorHandler.js";
import { logger } from "./logger.js";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "root",
  password: process.env.DB_ROOT_PASSWORD || "",
  database: process.env.DB_NAME || "nginx_proxy_manager",
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
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    logError("❌ Database connection failed:", error);
    return false;
  }
}

// Initialize database schema
export async function initializeDatabase(): Promise<void> {
  // Attempt to ensure database exists. If we don't have privilege, continue.
  try {
    const wantsRoot = process.env.DB_ROOT_PASSWORD && dbConfig.user !== "root";
    if (wantsRoot) {
      try {
        const rootPool = mysql.createPool({
          host: dbConfig.host,
          port: dbConfig.port,
          user: "root",
          password: process.env.DB_ROOT_PASSWORD,
          waitForConnections: true,
          connectionLimit: 2,
          queueLimit: 0,
        });
        await rootPool.execute(
          `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``
        );
        await rootPool.end();
        console.log(
          `✅ Database '${dbConfig.database}' created/verified using root user`
        );
      } catch (rootErr: unknown) {
        const msg =
          rootErr instanceof Error ? rootErr.message : String(rootErr);
        // Fall back to non-root attempt (might still succeed if already exists)
        console.log("⚠️  Root creation attempt failed or not permitted:", msg);
      }
    }

    // Try with application user (ignore privilege error for CREATE DATABASE)
    try {
      const tempPool = mysql.createPool({
        ...dbConfig,
        database: undefined,
      });
      await tempPool.execute(
        `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``
      );
      await tempPool.end();
      console.log(`✅ Database '${dbConfig.database}' verified (app user)`);
    } catch (createErr: unknown) {
      const msg =
        createErr instanceof Error ? createErr.message : String(createErr);
      if (msg.includes("access denied") || msg.includes("denied")) {
        console.log(
          "ℹ️  Skipping database creation (insufficient privileges); assuming it already exists."
        );
      } else {
        throw createErr;
      }
    }

    // Proceed with table creation & migrations inside the target DB
    await createTables();
    await runMigrations();
  } catch (error) {
    logError(
      "❌ Database initialization failed:",
      error instanceof Error ? error.message : error
    );
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
  last_login TIMESTAMP NULL DEFAULT NULL,
  password_changed_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create index for users email (with error handling for older MySQL versions)
    try {
      await connection.execute(`CREATE INDEX idx_users_email ON users(email)`);
    } catch (error: unknown) {
      // Index might already exist, ignore duplicate key error
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("Duplicate key name")) {
        logError("Warning creating users email index:", msg);
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

    // Safeguard: create/verify password_history early if missing (code may reference before migrations)
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS password_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_password_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id),
          INDEX idx_created_at (created_at)
        )
      `);
      // If table existed already, ensure foreign key present; add if missing (best-effort)
      const [fkRows] = await connection.execute<mysql.RowDataPacket[]>(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'password_history' AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_password_history_user'`,
        [dbConfig.database]
      );
      if ((fkRows as mysql.RowDataPacket[]).length === 0) {
        try {
          await connection.execute(
            `ALTER TABLE password_history ADD CONSTRAINT fk_password_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
          );
        } catch (fkErr) {
          const msg = fkErr instanceof Error ? fkErr.message : String(fkErr);
          if (!msg.includes("Duplicate") && !msg.includes("exists")) {
            logError("Warning adding password_history FK", msg);
          }
        }
      }
    } catch (phErr) {
      logError(
        "Warning: failed to create password_history pre-migration",
        phErr instanceof Error ? phErr.message : phErr
      );
    }

    console.log("✅ Database tables created/verified");

    // Safeguard: ensure critical user columns exist for older deployments
    try {
      const requiredColumns: { name: string; ddl: string; post?: string }[] = [
        {
          name: "first_login",
          ddl: "ALTER TABLE users ADD COLUMN first_login TINYINT(1) DEFAULT 1",
          post: "UPDATE users SET first_login = 0 WHERE id > 0",
        },
        {
          name: "last_login",
          ddl: "ALTER TABLE users ADD COLUMN last_login TIMESTAMP NULL DEFAULT NULL",
        },
        {
          name: "password_changed_at",
          ddl: "ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP NULL DEFAULT NULL",
          post: "UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL",
        },
      ];
      for (const col of requiredColumns) {
        const [colRows] = await connection.execute<mysql.RowDataPacket[]>(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
          [dbConfig.database, col.name]
        );
        if ((colRows as mysql.RowDataPacket[]).length === 0) {
          console.log(
            `⚠️  '${col.name}' column missing on users table. Adding now...`
          );
          try {
            // Try MySQL 8 IF NOT EXISTS syntax first
            await connection.execute(
              `ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.ddl
                .split(" ")
                .slice(5)
                .join(" ")}`
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (
              msg.includes("You have an error in your SQL syntax") ||
              msg.includes("check the manual")
            ) {
              // Retry without IF NOT EXISTS (older MySQL)
              await connection.execute(col.ddl);
            } else if (!msg.includes("Duplicate column name")) {
              throw err;
            }
          }
          if (col.post) {
            try {
              await connection.execute(col.post);
            } catch (postErr) {
              logError(
                `Post-add initialization failed for column ${col.name}`,
                postErr instanceof Error ? postErr.message : postErr
              );
            }
          }
          console.log(`✅ '${col.name}' column added (or already existed)`);
        }
      }
    } catch (safeguardErr) {
      logError(
        "Warning: failed to verify/add one or more user columns",
        safeguardErr instanceof Error ? safeguardErr.message : safeguardErr
      );
    }

    // Insert default admin user if not exists (after ensuring required columns)
    await insertDefaultData(connection);
  } finally {
    connection.release();
  }
}

// Insert default data
async function insertDefaultData(
  connection: mysql.PoolConnection
): Promise<void> {
  try {
    const defaultEmail = process.env.DEFAULT_USER_EMAIL || "admin@example.com";
    const defaultPassword = process.env.DEFAULT_USER_PASSWORD || "admin123";
    const defaultName = process.env.DEFAULT_USER_NAME || "Administrator";

    logger.info(`Checking for default user: ${defaultEmail}`);
    logger.info(`Looking for user with name: ${defaultName}`);

    const [rows] = await connection.execute(
      "SELECT id FROM users WHERE email = ?",
      [defaultEmail]
    );
    const userRows = rows as Array<{ id: number }>;
    if (userRows.length === 0) {
      const saltRounds = 10;
      const defaultPasswordHash = await bcrypt.hash(
        defaultPassword,
        saltRounds
      );
      // Determine if 'first_login' column exists (older init.sql may have created table without it)
      try {
        const [colCheck] = await connection.execute<mysql.RowDataPacket[]>(
          `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'first_login'`,
          [dbConfig.database]
        );
        const hasFirstLogin = (colCheck as mysql.RowDataPacket[]).length > 0;
        if (hasFirstLogin) {
          await connection.execute(
            "INSERT INTO users (email, password_hash, name, first_login) VALUES (?, ?, ?, ?)",
            [defaultEmail, defaultPasswordHash, defaultName, true]
          );
        } else {
          await connection.execute(
            "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
            [defaultEmail, defaultPasswordHash, defaultName]
          );
        }
      } catch (insertErr) {
        const msg =
          insertErr instanceof Error ? insertErr.message : String(insertErr);
        // If failed due to unknown column for first_login, attempt fallback insert without it
        if (msg.includes("Unknown column") && msg.includes("first_login")) {
          await connection.execute(
            "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
            [defaultEmail, defaultPasswordHash, defaultName]
          );
        } else {
          throw insertErr;
        }
      }
      console.log(
        `✅ Default admin user created (${defaultEmail} / ${defaultPassword})`
      );
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError("❌ Failed to insert default data:", msg);
  }
}

// Migration runner functions
export async function runMigrations(): Promise<void> {
  try {
    const migrationsDir = path.join(process.cwd(), "migrations");

    // Check if migrations directory exists
    try {
      await fs.access(migrationsDir);
    } catch {
      console.log("📁 No migrations directory found, skipping migrations");
      return;
    }

    // Get all SQL files from migrations directory
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter((file) => file.endsWith(".sql")).sort(); // Sort to ensure consistent execution order

    if (sqlFiles.length === 0) {
      console.log("📁 No migration files found");
      return;
    }

    console.log(`🔄 Found ${sqlFiles.length} migration files`);

    // Get already executed migrations
    const connection = await pool.getConnection();
    try {
      const [executedRows] = await connection.execute(
        'SELECT filename FROM migrations WHERE status = "success"'
      );
      interface MigrationRow {
        filename: string;
      }
      const executedMigrations = (executedRows as MigrationRow[]).map(
        (row) => row.filename
      );

      // Filter out already executed migrations
      const pendingMigrations = sqlFiles.filter(
        (file) => !executedMigrations.includes(file)
      );

      if (pendingMigrations.length === 0) {
        console.log("✅ All migrations are up to date");
        return;
      }

      console.log(`🔄 Running ${pendingMigrations.length} pending migrations`);

      // Execute pending migrations
      for (const filename of pendingMigrations) {
        await executeMigration(connection, migrationsDir, filename);
      }

      console.log("✅ All migrations completed successfully");
    } finally {
      connection.release();
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError("❌ Migration execution failed:", msg);
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
    const migrationSQL = await fs.readFile(filePath, "utf8");

    // Split SQL statements by semicolon and filter out empty statements
    const statements = migrationSQL
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

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
      logError("❌ Failed to record migration error:", recordError);
    }

    throw error;
  }
}

export interface MigrationStatusRecord {
  filename: string;
  executed_at: Date;
  status: string;
  error_message: string | null;
}

export async function getMigrationStatus(): Promise<MigrationStatusRecord[]> {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      "SELECT filename, executed_at, status, error_message FROM migrations ORDER BY executed_at DESC"
    );
    return rows as MigrationStatusRecord[];
  } finally {
    connection.release();
  }
}

export default pool;
