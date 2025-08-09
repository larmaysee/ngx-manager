/**
 * User authentication API routes
 * Handle user registration, login, token management, etc.
 */
import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/database.js";
import {
  authenticateToken,
  blacklistToken,
  generateTokenId,
} from "../middleware/auth.js";
import { body, validationResult } from "express-validator";
import rateLimit from "express-rate-limit";
import {
  logError,
  createValidationError,
  createAuthenticationError,
  createDatabaseError,
  createNotFoundError,
  asyncHandler,
} from "../utils/errorHandler.js";

// Enhanced rate limiting for auth endpoints
const authRateLimit = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"), // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || "5"), // 5 attempts per window
  message: {
    success: false,
    error: "Too many authentication attempts, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: true,
});

// Password strength validation
const validatePassword = (
  password: string
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const minLength = parseInt(process.env.MIN_PASSWORD_LENGTH || "12");

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Generate secure JWT with additional claims
const generateSecureJWT = (userId: number, email: string): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === "your_jwt_secret_change_this_in_production") {
    throw new Error("JWT_SECRET not properly configured");
  }

  const tokenId = generateTokenId();
  const payload = {
    userId,
    email,
    jti: tokenId, // JWT ID for token tracking
    iss: process.env.JWT_ISSUER || "ngx-manager", // Issuer
    aud: process.env.JWT_AUDIENCE || "ngx-manager-users", // Audience
  };

  return jwt.sign(payload, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h", // Shorter expiration for security
    algorithm: "HS256",
  } as jwt.SignOptions);
};

// Track failed login attempts
const loginAttempts = new Map<
  string,
  { count: number; lastAttempt: Date; lockedUntil?: Date }
>();

const checkAccountLockout = (
  email: string
): { isLocked: boolean; remainingTime?: number } => {
  const attempts = loginAttempts.get(email);
  if (!attempts) return { isLocked: false };

  const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5");
  const lockoutTime = parseInt(process.env.LOCKOUT_TIME_MS || "900000"); // 15 minutes

  if (attempts.count >= maxAttempts) {
    const lockoutEnd = new Date(attempts.lastAttempt.getTime() + lockoutTime);
    if (new Date() < lockoutEnd) {
      return {
        isLocked: true,
        remainingTime: Math.ceil(
          (lockoutEnd.getTime() - Date.now()) / 1000 / 60
        ), // minutes
      };
    } else {
      // Reset attempts after lockout period
      loginAttempts.delete(email);
      return { isLocked: false };
    }
  }

  return { isLocked: false };
};

const recordFailedAttempt = (email: string): void => {
  const attempts = loginAttempts.get(email) || {
    count: 0,
    lastAttempt: new Date(),
  };
  attempts.count++;
  attempts.lastAttempt = new Date();
  loginAttempts.set(email, attempts);
};

const clearFailedAttempts = (email: string): void => {
  loginAttempts.delete(email);
};

// Password history management
const checkPasswordHistory = async (
  userId: number,
  newPassword: string
): Promise<boolean> => {
  const connection = await pool.getConnection();
  try {
    const historyLimit = parseInt(process.env.PASSWORD_HISTORY_LIMIT || "5");

    // Get recent password hashes
    const [rows] = await connection.execute(
      "SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      [userId, historyLimit]
    );

    const passwordHistory = rows as { password_hash: string }[];

    // Check if new password matches any recent passwords
    for (const record of passwordHistory) {
      if (await bcrypt.compare(newPassword, record.password_hash)) {
        return false; // Password was used recently
      }
    }

    return true; // Password is not in recent history
  } finally {
    connection.release();
  }
};

const addPasswordToHistory = async (
  userId: number,
  passwordHash: string
): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const historyLimit = parseInt(process.env.PASSWORD_HISTORY_LIMIT || "5");

    // Add new password to history
    await connection.execute(
      "INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)",
      [userId, passwordHash]
    );

    // Clean up old password history beyond the limit
    await connection.execute(
      `DELETE FROM password_history 
       WHERE user_id = ? AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM password_history 
           WHERE user_id = ? 
           ORDER BY created_at DESC 
           LIMIT ?
         ) AS recent_passwords
       )`,
      [userId, userId, historyLimit]
    );
  } finally {
    connection.release();
  }
};

const router = Router();

/**
 * User Registration
 * POST /api/auth/register
 */
router.post(
  "/register",
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email format"),
    body("password")
      .isLength({ min: parseInt(process.env.MIN_PASSWORD_LENGTH || "12") })
      .withMessage(
        `Password must be at least ${
          process.env.MIN_PASSWORD_LENGTH || "12"
        } characters long`
      ),
    body("name")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Name must be between 2 and 100 characters")
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage("Name can only contain letters and spaces"),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors.array(),
      });
      return;
    }

    const { email, password, name } = req.body;

    // Enhanced password validation
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        success: false,
        error: "Password does not meet security requirements",
        details: passwordValidation.errors,
      });
      return;
    }

    const connection = await pool.getConnection();
    try {
      // Check if user already exists
      const [existingUsers] = await connection.execute(
        "SELECT id FROM users WHERE email = ?",
        [email.toLowerCase()]
      );

      if ((existingUsers as any[]).length > 0) {
        res.status(409).json({
          success: false,
          error: "User with this email already exists",
        });
        return;
      }

      // Hash password with higher salt rounds for better security
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const [result] = await connection.execute(
        "INSERT INTO users (email, password_hash, name, created_at, password_changed_at) VALUES (?, ?, ?, NOW(), NOW())",
        [email.toLowerCase(), passwordHash, name.trim()]
      );

      const userId = (result as any).insertId;

      // Add initial password to history
      await addPasswordToHistory(userId, passwordHash);

      // Generate secure JWT token
      const token = generateSecureJWT(userId, email.toLowerCase());

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        token,
        user: {
          id: userId,
          email: email.toLowerCase(),
          name: name.trim(),
        },
      });
    } catch (error) {
      logError("User Registration", (error as Error).message, undefined);
      throw createDatabaseError("Registration failed");
    } finally {
      connection.release();
    }
  })
);

/**
 * User Login
 * POST /api/auth/login
 */
router.post(
  "/login",
  authRateLimit,
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email format"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors.array(),
      });
      return;
    }

    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase();

    // Check account lockout
    const lockoutStatus = checkAccountLockout(normalizedEmail);
    if (lockoutStatus.isLocked) {
      res.status(429).json({
        success: false,
        error: `Account temporarily locked due to too many failed attempts. Try again in ${lockoutStatus.remainingTime} minutes.`,
      });
      return;
    }

    const connection = await pool.getConnection();
    try {
      // Get user from database
      const [rows] = await connection.execute(
        "SELECT id, email, password_hash, name, first_login, last_login FROM users WHERE email = ?",
        [normalizedEmail]
      );

      const users = rows as any[];
      if (users.length === 0) {
        recordFailedAttempt(normalizedEmail);
        res.status(401).json({
          success: false,
          error: "Invalid email or password",
        });
        return;
      }

      const user = users[0];

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        password,
        user.password_hash
      );
      if (!isPasswordValid) {
        recordFailedAttempt(normalizedEmail);
        res.status(401).json({
          success: false,
          error: "Invalid email or password",
        });
        return;
      }

      // Clear failed attempts on successful login
      clearFailedAttempts(normalizedEmail);

      // Update last login timestamp
      await connection.execute(
        "UPDATE users SET last_login = NOW() WHERE id = ?",
        [user.id]
      );

      // Generate secure JWT token
      const token = generateSecureJWT(user.id, user.email);

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          first_login: user.first_login,
        },
      });
    } catch (error) {
      logError("User Login", (error as Error).message, undefined);
      throw createDatabaseError("Login failed");
    } finally {
      connection.release();
    }
  })
);

/**
 * Get Current User
 * GET /api/auth/me
 */
router.get(
  "/me",
  authenticateToken,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      user: {
        id: req.user?.id,
        email: req.user?.email,
        name: req.user?.name,
      },
    });
  })
);

/**
 * Change Password
 * PUT /api/auth/change-password
 */
router.put(
  "/change-password",
  authenticateToken,
  [
    body("currentPassword")
      .notEmpty()
      .withMessage("Current password is required"),
    body("newPassword").custom((value) => {
      const result = validatePassword(value);
      if (!result.isValid) {
        throw new Error(result.errors.join(", "));
      }
      return true;
    }),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors.array(),
      });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw createAuthenticationError("Authentication required");
    }

    // Validate new password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      throw createValidationError(
        "New password does not meet security requirements",
        passwordValidation.errors
      );
    }

    const connection = await pool.getConnection();
    try {
      // Get current user data
      const [users] = (await connection.execute(
        "SELECT password_hash FROM users WHERE id = ?",
        [userId]
      )) as any;

      if (!Array.isArray(users) || users.length === 0) {
        throw createNotFoundError("User not found");
      }

      const user = users[0];

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password_hash
      );
      if (!isCurrentPasswordValid) {
        res.status(400).json({
          success: false,
          error: "Current password is incorrect",
        });
        return;
      }

      // Check password history
      const isPasswordUnique = await checkPasswordHistory(userId, newPassword);
      if (!isPasswordUnique) {
        const historyLimit = process.env.PASSWORD_HISTORY_LIMIT || "5";
        res.status(400).json({
          success: false,
          error: `Password cannot be one of your last ${historyLimit} passwords`,
        });
        return;
      }

      // Hash new password
      const saltRounds = 12;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await connection.execute(
        "UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?",
        [hashedNewPassword, userId]
      );

      // Add new password to history
      await addPasswordToHistory(userId, hashedNewPassword);

      res.json({
        success: true,
        message: "Password updated successfully",
      });
    } catch (error) {
      logError(error, "Change Password", req.user?.id);
      throw createDatabaseError("Password change failed");
    } finally {
      connection.release();
    }
  })
);

/**
 * Logout
 * POST /api/auth/logout
 */
router.post(
  "/logout",
  authenticateToken,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
      // Add token to blacklist
      blacklistToken(token);
    }

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  })
);

export default router;
