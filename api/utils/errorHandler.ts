import { Request, Response } from 'express';
import { logger } from '../config/logger';

/**
 * Error types for classification
 */
export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  DATABASE = 'DATABASE_ERROR',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE_ERROR',
  INTERNAL = 'INTERNAL_ERROR'
}

/**
 * Custom error class with type classification
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    type: ErrorType = ErrorType.INTERNAL,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Sanitize error messages to prevent information leakage
 */
export function sanitizeError(error: any): { message: string; type: string } {
  // Default safe error message
  let message = 'An internal server error occurred';
  let type = ErrorType.INTERNAL;

  if (error instanceof AppError) {
    message = error.message;
    type = error.type;
  } else if (error.code === 'ER_DUP_ENTRY') {
    message = 'Resource already exists';
    type = ErrorType.VALIDATION;
  } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    message = 'Referenced resource not found';
    type = ErrorType.VALIDATION;
  } else if (error.code === 'ECONNREFUSED') {
    message = 'Service temporarily unavailable';
    type = ErrorType.EXTERNAL_SERVICE;
  } else if (error.message?.includes('JWT')) {
    message = 'Authentication token invalid';
    type = ErrorType.AUTHENTICATION;
  } else if (error.message?.includes('password')) {
    message = 'Authentication failed';
    type = ErrorType.AUTHENTICATION;
  }

  return { message, type };
}

/**
 * Log error securely without exposing sensitive information
 */
export function logError(error: any, context?: string, userId?: number): void {
  const errorId = generateErrorId();

  // Log full error details securely (not exposed to client)
  logger.error('Application Error', {
    errorId,
    context,
    userId,
    message: error.message,
    stack: error.stack,
    type: error.type || 'UNKNOWN',
    code: error.code,
    details: error.details,
    timestamp: new Date().toISOString()
  });

  // Remove return since function is void
  logger.debug('Generated error ID:', errorId);
}

/**
 * Generate unique error ID for tracking
 */
function generateErrorId(): string {
  return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Express error handler middleware
 */
export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  next: any
): void {
  const errorId = logError(error, `${req.method} ${req.path}`, req.user?.id);
  const sanitized = sanitizeError(error);

  // Determine status code
  let statusCode = 500;
  if (error instanceof AppError) {
    statusCode = error.statusCode;
  } else if (error.type === ErrorType.VALIDATION) {
    statusCode = 400;
  } else if (error.type === ErrorType.AUTHENTICATION) {
    statusCode = 401;
  } else if (error.type === ErrorType.AUTHORIZATION) {
    statusCode = 403;
  } else if (error.type === ErrorType.NOT_FOUND) {
    statusCode = 404;
  }

  // Send sanitized error response
  res.status(statusCode).json({
    success: false,
    error: sanitized.message,
    type: sanitized.type,
    errorId: process.env.NODE_ENV === 'development' ? errorId : undefined,
    timestamp: new Date().toISOString()
  });
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: any) => Promise<any>
) {
  return (req: Request, res: Response, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create specific error types
 */
export const createValidationError = (message: string, details?: any) =>
  new AppError(message, ErrorType.VALIDATION, 400, true, details);

export const createAuthenticationError = (message: string = 'Authentication required') =>
  new AppError(message, ErrorType.AUTHENTICATION, 401);

export const createAuthorizationError = (message: string = 'Access denied') =>
  new AppError(message, ErrorType.AUTHORIZATION, 403);

export const createNotFoundError = (message: string = 'Resource not found') =>
  new AppError(message, ErrorType.NOT_FOUND, 404);

export const createDatabaseError = (message: string = 'Database operation failed') =>
  new AppError(message, ErrorType.DATABASE, 500);

export const createExternalServiceError = (message: string = 'External service unavailable') =>
  new AppError(message, ErrorType.EXTERNAL_SERVICE, 503);

export const createConflictError = (message: string = 'Resource conflict') =>
  new AppError(message, ErrorType.VALIDATION, 409);