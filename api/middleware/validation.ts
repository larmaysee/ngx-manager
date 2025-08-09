import { body, param, query, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

/**
 * Common validation rules
 */
export const commonValidations = {
  // Email validation
  email: () => body('email')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Invalid email format or too long'),

  // Password validation
  password: (field: string = 'password') => body(field)
    .isLength({ min: parseInt(process.env.MIN_PASSWORD_LENGTH || '8'), max: 128 })
    .withMessage(`Password must be between ${process.env.MIN_PASSWORD_LENGTH || '8'} and 128 characters`)
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 'i')
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

  // Name validation
  name: () => body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Name can only contain letters, spaces, hyphens, and apostrophes'),

  // Domain validation
  domain: () => body('domain')
    .trim()
    .isLength({ min: 1, max: 253 })
    .withMessage('Domain must be between 1 and 253 characters')
    .matches(/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/)
    .withMessage('Invalid domain format'),

  // Port validation
  port: (field: string = 'port') => body(field)
    .isInt({ min: 1, max: 65535 })
    .withMessage('Port must be between 1 and 65535'),

  // Target URL validation
  target: () => body('target')
    .trim()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Target must be a valid HTTP or HTTPS URL')
    .isLength({ max: 2048 })
    .withMessage('Target URL is too long'),

  // ID parameter validation
  id: () => param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),

  // Boolean validation
  boolean: (field: string) => body(field)
    .optional()
    .isBoolean()
    .withMessage(`${field} must be a boolean value`),

  // String length validation
  stringLength: (field: string, min: number = 1, max: number = 255) => body(field)
    .trim()
    .isLength({ min, max })
    .withMessage(`${field} must be between ${min} and ${max} characters`),

  // Alphanumeric validation
  alphanumeric: (field: string) => body(field)
    .trim()
    .isAlphanumeric()
    .withMessage(`${field} must contain only letters and numbers`),

  // SSL certificate validation
  sslCert: () => body('certificate')
    .trim()
    .matches(/^-----BEGIN CERTIFICATE-----[\s\S]*-----END CERTIFICATE-----$/)
    .withMessage('Invalid SSL certificate format'),

  // SSL private key validation
  sslKey: () => body('private_key')
    .trim()
    .matches(/^-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]*-----END (RSA )?PRIVATE KEY-----$/)
    .withMessage('Invalid SSL private key format'),

  // Pagination validation
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],

  // Search query validation
  search: () => query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters')
    .escape() // Escape HTML entities
};

/**
 * Validation sets for different endpoints
 */
export const validationSets = {
  // User registration
  userRegistration: [
    commonValidations.email(),
    commonValidations.password(),
    commonValidations.name()
  ],

  // User login
  userLogin: [
    commonValidations.email(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],

  // Change password
  changePassword: [
    commonValidations.email(),
    commonValidations.name(),
    body('currentPassword')
      .if(body('newPassword').exists())
      .notEmpty()
      .withMessage('Current password is required when changing password'),
    commonValidations.password('newPassword')
      .optional()
  ],

  // Proxy creation
  createProxy: [
    commonValidations.domain(),
    commonValidations.port(),
    commonValidations.target(),
    commonValidations.boolean('ssl_enabled')
  ],

  // Proxy update
  updateProxy: [
    commonValidations.id(),
    commonValidations.domain(),
    commonValidations.port(),
    commonValidations.target(),
    commonValidations.boolean('ssl_enabled')
  ],

  // SSL certificate upload
  uploadSSL: [
    commonValidations.id(),
    commonValidations.sslCert(),
    commonValidations.sslKey()
  ],

  // Generic ID validation
  idParam: [
    commonValidations.id()
  ],

  // List with pagination
  listWithPagination: [
    ...commonValidations.pagination(),
    commonValidations.search()
  ]
};

/**
 * Middleware to handle validation errors
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined
    }));

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: formattedErrors
    });
    return;
  }
  
  next();
};

/**
 * Sanitization middleware
 */
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Recursively sanitize all string values in request body
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.trim();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    
    return obj;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  next();
};

/**
 * Content Security Policy validation
 */
export const validateContentType = (
  allowedTypes: string[] = ['application/json']
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.get('Content-Type');
    
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
        res.status(415).json({
          success: false,
          error: 'Unsupported Media Type',
          allowedTypes
        });
        return;
      }
    }
    
    next();
  };
};

/**
 * Request size validation
 */
export const validateRequestSize = (
  maxSize: number = 1024 * 1024 // 1MB default
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      res.status(413).json({
        success: false,
        error: 'Request entity too large',
        maxSize: `${maxSize} bytes`
      });
      return;
    }
    
    next();
  };
};

// Export aliases for backward compatibility
export const idValidation = validationSets.idParam;
export const proxyValidation = validationSets.createProxy;
export const proxyUpdateValidation = validationSets.updateProxy;
export const paginationValidation = validationSets.listWithPagination;
export const domainValidation = [commonValidations.domain()];