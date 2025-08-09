/**
 * Authentication middleware for JWT token verification
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import crypto from 'crypto';
import { logError } from '../utils/errorHandler.js';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        name: string;
        first_login?: boolean;
      };
    }
  }
}

interface JwtPayload {
  userId: number;
  email: string;
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

// Token blacklist for logout functionality
const tokenBlacklist = new Set<string>();

// Clean up expired tokens from blacklist periodically
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const token of tokenBlacklist) {
    try {
      const decoded = jwt.decode(token) as JwtPayload;
      if (decoded && decoded.exp < now) {
        tokenBlacklist.delete(token);
      }
    } catch {
      tokenBlacklist.delete(token);
    }
  }
}, 60 * 60 * 1000); // Clean every hour

/**
 * Middleware to verify JWT token and authenticate user
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required'
      });
      return;
    }

    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      res.status(401).json({
        success: false,
        error: 'Token has been revoked'
      });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret === 'your_jwt_secret_change_this_in_production') {
      logError('JWT_SECRET not properly configured', 'JWT_SECRET not properly configured');
      res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, jwtSecret, {
      issuer: process.env.JWT_ISSUER || 'ngx-manager',
      audience: process.env.JWT_AUDIENCE || 'ngx-manager-users'
    }) as JwtPayload;

    // Validate token structure
    if (!decoded.userId || !decoded.email || !decoded.jti) {
      res.status(401).json({
        success: false,
        error: 'Invalid token structure'
      });
      return;
    }

    // Get user from database to ensure they still exist and are active
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT id, email, name, first_login, created_at FROM users WHERE id = ? AND email = ?',
        [decoded.userId, decoded.email]
      );

      const users = rows as any[];
      if (users.length === 0) {
        res.status(401).json({
          success: false,
          error: 'User not found or token invalid'
        });
        return;
      }

      const user = users[0];
      
      // Check if token was issued before user's last password change
      // This helps invalidate old tokens when password is changed
      const tokenIssuedAt = new Date(decoded.iat * 1000);
      const userCreatedAt = new Date(user.created_at);
      
      if (tokenIssuedAt < userCreatedAt) {
        res.status(401).json({
          success: false,
          error: 'Token is no longer valid'
        });
        return;
      }

      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        first_login: user.first_login
      };
      (req as any).tokenId = decoded.jti;

      next();
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    } else if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    } else {
      logError('Authentication error', (error as Error).message);
      res.status(500).json({
        success: false,
        error: 'Authentication failed'
      });
    }
  }
};

// Function to blacklist a token (for logout)
export const blacklistToken = (token: string): void => {
  tokenBlacklist.add(token);
};

// Function to generate a secure JWT token ID
export const generateTokenId = (): string => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      next();
      return;
    }

    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      next();
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      next();
      return;
    }

    const decoded = jwt.verify(token, jwtSecret, {
      issuer: process.env.JWT_ISSUER || 'ngx-manager',
      audience: process.env.JWT_AUDIENCE || 'ngx-manager-users'
    }) as JwtPayload;

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT id, email, name, first_login FROM users WHERE id = ? AND email = ?',
        [decoded.userId, decoded.email]
      );

      const users = rows as any[];
      if (users.length > 0) {
        req.user = {
          id: users[0].id,
          email: users[0].email,
          name: users[0].name,
          first_login: users[0].first_login
        };
        (req as any).tokenId = decoded.jti;
      }
    } finally {
      connection.release();
    }

    next();
  } catch (error) {
    // Ignore errors in optional auth
    next();
  }
};