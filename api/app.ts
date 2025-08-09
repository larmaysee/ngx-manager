/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import winston from "winston";
import { errorHandler } from "./utils/errorHandler.js";
import authRoutes from "./routes/auth.js";
import proxyRoutes from "./routes/proxies.js";
import sslRoutes from "./routes/ssl.js";
import renewalRoutes from "./routes/renewal.js";
import { initializeDatabase } from "./config/database.js";

// load env
dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "ngx-manager-api" },
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

const app: express.Application = express();

// Initialize database on startup
initializeDatabase().catch((error) => {
  logger.error("❌ Failed to initialize database:", error);
  process.exit(1);
});

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for auth
  message: {
    success: false,
    error: "Too many authentication attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });
  next();
});

app.use(limiter);
app.use(cors());
app.use(express.json({ limit: "1mb" })); // Reduced from 10mb for security
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/**
 * API Routes
 */
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/proxies", proxyRoutes);
app.use("/api/ssl", sslRoutes);
app.use("/api/renewal", renewalRoutes);

/**
 * Enhanced health check
 */
app.use(
  "/api/health",
  (req: Request, res: Response, next: NextFunction): void => {
    const healthCheck = {
      success: true,
      message: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      version: process.env.npm_package_version || "1.0.0",
    };

    res.status(200).json(healthCheck);
  }
);

/**
 * Enhanced error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error("Server error:", {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== "production";

  res.status(500).json({
    success: false,
    error: "Internal server error",
    ...(isDevelopment && { details: error.message, stack: error.stack }),
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "API not found",
  });
});

/**
 * Error handling middleware (must be last)
 */
app.use(errorHandler);

export default app;
