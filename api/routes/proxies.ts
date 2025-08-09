/**
 * Proxy management API routes
 * Handle CRUD operations for proxy configurations
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { 
  proxyValidation, 
  proxyUpdateValidation, 
  idValidation, 
  handleValidationErrors,
  sanitizeInput 
} from '../middleware/validation';
import { 
  logError, 
  createDatabaseError, 
  createNotFoundError, 
  createConflictError,
  asyncHandler 
} from '../utils/errorHandler';
import nginxGenerator from '../services/nginxGenerator';

const router = Router();

// All proxy routes require authentication
router.use(authenticateToken);

// Helper function to parse target URL into host and port
function parseTarget(target: string): { target_host: string; target_port: number } {
  try {
    const url = new URL(target);
    return {
      target_host: url.hostname,
      target_port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80)
    };
  } catch {
    // Fallback for malformed URLs
    const parts = target.replace(/^https?:\/\//, '').split(':');
    return {
      target_host: parts[0] || 'localhost',
      target_port: parseInt(parts[1]) || 80
    };
  }
}

// Helper function to format proxy response
function formatProxyResponse(proxy: any) {
  const { target_host, target_port } = parseTarget(proxy.target);
  return {
    ...proxy,
    target_host,
    target_port
  };
}

/**
 * Get all proxies for the authenticated user
 * GET /api/proxies
 */
router.get('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT id, domain, target, ssl_enabled, 
              created_at, updated_at, status
       FROM proxies 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [req.user!.id]
    );

    const formattedProxies = (rows as any[]).map(formatProxyResponse);
    res.json({
      success: true,
      proxies: formattedProxies
    });
  } finally {
    connection.release();
  }
}));

/**
 * Get a specific proxy by ID
 * GET /api/proxies/:id
 */
router.get('/:id', 
  idValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const proxyId = parseInt(req.params.id);

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        `SELECT id, domain, target, ssl_enabled, 
                created_at, updated_at, status
         FROM proxies 
         WHERE id = ? AND user_id = ?`,
        [proxyId, req.user!.id]
      );

      const proxies = rows as any[];
      if (proxies.length === 0) {
        throw createNotFoundError('Proxy not found');
      }

      res.json({
        success: true,
        proxy: formatProxyResponse(proxies[0])
      });
    } finally {
      connection.release();
    }
  })
);

/**
 * Create a new proxy
 * POST /api/proxies
 */
router.post('/', 
  proxyValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { domain, target_host, target_port, ssl_enabled } = req.body;

    const port = parseInt(target_port);

    // Combine target_host and target_port into target URL
    const target = `http://${target_host}:${port}`;

    const connection = await pool.getConnection();
    try {
      // Check if domain already exists
      const [existingProxies] = await connection.execute(
        'SELECT id FROM proxies WHERE domain = ?',
        [domain]
      );

      if ((existingProxies as any[]).length > 0) {
        throw createConflictError('A proxy with this domain already exists');
      }

      // Create proxy
      const [result] = await connection.execute(
        `INSERT INTO proxies (user_id, domain, target, ssl_enabled, status) 
         VALUES (?, ?, ?, ?, 'active')`,
        [req.user!.id, domain, target, ssl_enabled || false]
      );

      const proxyId = (result as any).insertId;

      // Get the created proxy
      const [newProxy] = await connection.execute(
        `SELECT id, domain, target, ssl_enabled, 
                created_at, updated_at, status
         FROM proxies 
         WHERE id = ?`,
        [proxyId]
      );

      const createdProxy = (newProxy as any[])[0];

      // Generate nginx configuration
      try {
        await nginxGenerator.writeProxyConfig(createdProxy);
        await nginxGenerator.reloadNginx();
      } catch (nginxError) {
        logError(nginxError, 'Nginx Config Generation', req.user?.id);
        // Don't fail the request, but log the error
      }

      res.status(201).json({
        success: true,
        message: 'Proxy created successfully',
        proxy: formatProxyResponse(createdProxy)
      });
    } finally {
      connection.release();
    }
  })
);

/**
 * Update an existing proxy
 * PUT /api/proxies/:id
 */
router.put('/:id', 
  proxyUpdateValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const proxyId = parseInt(req.params.id);
    const { domain, target_host, target_port, ssl_enabled, status } = req.body;

    const port = parseInt(target_port);

    // Combine target_host and target_port into target URL
    const target = `http://${target_host}:${port}`;

    const connection = await pool.getConnection();
    try {
      // Check if proxy exists and belongs to user
      const [existingProxy] = await connection.execute(
        'SELECT id FROM proxies WHERE id = ? AND user_id = ?',
        [proxyId, req.user!.id]
      );

      if ((existingProxy as any[]).length === 0) {
        throw createNotFoundError('Proxy not found');
      }

      // Check if domain is taken by another proxy
      const [domainCheck] = await connection.execute(
        'SELECT id FROM proxies WHERE domain = ? AND id != ?',
        [domain, proxyId]
      );

      if ((domainCheck as any[]).length > 0) {
        throw createConflictError('A proxy with this domain already exists');
      }

      // Update proxy
      await connection.execute(
        `UPDATE proxies 
         SET domain = ?, target = ?, ssl_enabled = ?, 
             status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [domain, target, ssl_enabled || false, status || 'active', proxyId, req.user!.id]
      );

      // Get the updated proxy
      const [updatedProxy] = await connection.execute(
        `SELECT id, domain, target, ssl_enabled, 
                created_at, updated_at, status
         FROM proxies 
         WHERE id = ?`,
        [proxyId]
      );

      const updatedProxyData = (updatedProxy as any[])[0];

      // Update nginx configuration
      try {
        await nginxGenerator.writeProxyConfig(updatedProxyData);
        await nginxGenerator.reloadNginx();
      } catch (nginxError) {
        logError(nginxError, 'Nginx Config Update', req.user?.id);
        // Don't fail the request, but log the error
      }

      res.json({
        success: true,
        message: 'Proxy updated successfully',
        proxy: formatProxyResponse(updatedProxyData)
      });
    } finally {
      connection.release();
    }
  })
);

/**
 * Delete a proxy
 * DELETE /api/proxies/:id
 */
router.delete('/:id', 
  idValidation,
  handleValidationErrors,
  sanitizeInput,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const proxyId = parseInt(req.params.id);

    const connection = await pool.getConnection();
    try {
      // Check if proxy exists and belongs to user
      const [existingProxy] = await connection.execute(
        'SELECT id FROM proxies WHERE id = ? AND user_id = ?',
        [proxyId, req.user!.id]
      );

      if ((existingProxy as any[]).length === 0) {
        throw createNotFoundError('Proxy not found');
      }

      // Delete associated SSL certificates first
      await connection.execute(
        'DELETE FROM ssl_certificates WHERE proxy_id = ?',
        [proxyId]
      );

      // Get proxy domain before deletion for nginx cleanup
      const [proxyData] = await connection.execute(
        'SELECT domain FROM proxies WHERE id = ? AND user_id = ?',
        [proxyId, req.user!.id]
      );

      const domain = (proxyData as any[])[0]?.domain;

      // Delete proxy
      await connection.execute(
        'DELETE FROM proxies WHERE id = ? AND user_id = ?',
        [proxyId, req.user!.id]
      );

      // Remove nginx configuration
      if (domain) {
        try {
          await nginxGenerator.removeProxyConfig(domain);
          await nginxGenerator.reloadNginx();
        } catch (nginxError) {
          logError(nginxError, 'Nginx Config Removal', req.user?.id);
          // Don't fail the request, but log the error
        }
      }

      res.json({
        success: true,
        message: 'Proxy deleted successfully'
      });
    } finally {
      connection.release();
    }
  })
);

export default router;