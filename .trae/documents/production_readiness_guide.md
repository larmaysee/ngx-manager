# Production Readiness Guide for Nginx Proxy Manager

## Overview
This guide provides comprehensive recommendations to make the Nginx Proxy Manager application production-ready for deployment on a real server. The current codebase has several security and configuration issues that must be addressed before production deployment.

## 🚨 Critical Security Issues (Must Fix)

### 1. Environment Variables & Secrets Management

**Current Issues:**
- Hardcoded passwords in `docker-compose.yml`
- Weak default JWT secret
- Database credentials exposed

**Required Actions:**
```bash
# Create secure environment variables
JWT_SECRET=$(openssl rand -base64 64)
DB_PASSWORD=$(openssl rand -base64 32)
MYSQL_ROOT_PASSWORD=$(openssl rand -base64 32)

# Use Docker secrets or external secret management
# Never commit .env files to version control
```

**Production .env Template:**
```env
# Database Configuration (Use strong passwords)
DB_HOST=db
DB_PORT=3306
DB_USER=ngx_user
DB_PASSWORD=<STRONG_RANDOM_PASSWORD>
DB_NAME=nginx_proxy_manager

# JWT Configuration (Use 64+ character random string)
JWT_SECRET=<STRONG_RANDOM_JWT_SECRET>

# Server Configuration
PORT=3001
NODE_ENV=production

# Default Admin User (Change immediately after first login)
DEFAULT_USER_EMAIL=admin@yourdomain.com
DEFAULT_USER_PASSWORD=<TEMPORARY_STRONG_PASSWORD>
DEFAULT_USER_NAME=Administrator

# Nginx Configuration
NGINX_CONFIG_PATH=/etc/nginx/conf.d

# SSL Configuration
CERTBOT_CERTS_PATH=/etc/letsencrypt
CERTBOT_WWW_PATH=/var/www/certbot

# Frontend Configuration
VITE_API_URL=https://yourdomain.com
```

### 2. Database Security

**Current Issues:**
- Database exposed on port 3306
- No connection encryption
- Basic connection pooling

**Required Actions:**
```yaml
# Remove database port exposure in docker-compose.yml
db:
  # Remove this line:
  # ports:
  #   - "3306:3306"
  
  environment:
    MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    MYSQL_DATABASE: ${DB_NAME}
    MYSQL_USER: ${DB_USER}
    MYSQL_PASSWORD: ${DB_PASSWORD}
    # Add SSL configuration
    MYSQL_SSL_MODE: REQUIRED
```

### 3. Authentication & Authorization

**Current Issues:**
- No rate limiting on authentication endpoints
- No account lockout mechanism
- No password complexity requirements
- JWT tokens don't expire

**Required Fixes:**

1. **Add JWT expiration:**
```typescript
// In auth routes
const token = jwt.sign(
  { userId: user.id, email: user.email },
  jwtSecret,
  { expiresIn: '24h' } // Add expiration
);
```

2. **Implement password complexity:**
```typescript
// Add to registration/password change
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
if (!passwordRegex.test(password)) {
  throw new Error('Password must be at least 12 characters with uppercase, lowercase, number, and special character');
}
```

3. **Add account lockout:**
```sql
-- Add to users table
ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until DATETIME NULL;
```

### 4. Input Validation & Sanitization

**Current Issues:**
- No input validation middleware
- Potential SQL injection risks
- No XSS protection

**Required Actions:**
```bash
npm install express-validator helmet express-rate-limit
```

```typescript
// Add to app.ts
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Stricter rate limiting for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  skipSuccessfulRequests: true
});
app.use('/api/auth/login', authLimiter);
```

## 🔧 Performance & Reliability

### 1. Database Optimization

**Add Connection Pooling Configuration:**
```typescript
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 20, // Increase for production
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  // Add SSL configuration
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
};
```

### 2. Logging & Monitoring

**Current Issues:**
- Basic console logging
- No structured logging
- No monitoring setup

**Required Actions:**
```bash
npm install winston morgan
```

```typescript
// Add structured logging
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

### 3. Error Handling

**Improve Error Handling:**
```typescript
// Enhanced error handler
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : error.message;
    
  res.status(500).json({
    success: false,
    error: message
  });
});
```

## 🐳 Docker & Deployment

### 1. Production Docker Configuration

**Update docker-compose.yml for production:**
```yaml
version: '3.8'

services:
  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME}
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
      - ./docker/mysql/init.sql:/docker-entrypoint-initdb.d/init.sql
    # Remove port exposure for security
    networks:
      - ngx_network
    # Add health check
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10

  server:
    build:
      context: .
      dockerfile: docker/server/Dockerfile
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DB_HOST=db
      - DB_PORT=3306
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
      - JWT_SECRET=${JWT_SECRET}
      - PORT=5000
    volumes:
      - nginx_configs:/etc/nginx/conf.d
      - certbot_certs:/etc/letsencrypt
      - certbot_www:/var/www/certbot
      - app_logs:/app/logs
    depends_on:
      db:
        condition: service_healthy
    networks:
      - ngx_network
    # Add health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  client:
    build:
      context: .
      dockerfile: docker/client/Dockerfile
    restart: unless-stopped
    environment:
      - VITE_API_URL=${VITE_API_URL}
    depends_on:
      - server
    networks:
      - ngx_network

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - nginx_configs:/etc/nginx/conf.d
      - certbot_certs:/etc/letsencrypt
      - certbot_www:/var/www/certbot
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./docker/nginx/default.conf:/etc/nginx/conf.d/default.conf
      - nginx_logs:/var/log/nginx
    depends_on:
      - client
      - server
    networks:
      - ngx_network

volumes:
  mysql_data:
  nginx_configs:
  certbot_certs:
  certbot_www:
  app_logs:
  nginx_logs:

networks:
  ngx_network:
    driver: bridge
```

### 2. SSL/TLS Configuration

**Enhanced Nginx SSL Configuration:**
```nginx
# Add to nginx.conf
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;

# HSTS (HTTP Strict Transport Security)
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/letsencrypt/live/yourdomain.com/chain.pem;
```

## 📋 Pre-Production Checklist

### Security Checklist
- [ ] Change all default passwords
- [ ] Generate strong JWT secret (64+ characters)
- [ ] Remove database port exposure
- [ ] Implement rate limiting
- [ ] Add input validation
- [ ] Enable HTTPS everywhere
- [ ] Configure security headers
- [ ] Set up proper CORS
- [ ] Implement account lockout
- [ ] Add password complexity requirements

### Configuration Checklist
- [ ] Set NODE_ENV=production
- [ ] Configure proper logging
- [ ] Set up log rotation
- [ ] Configure database connection pooling
- [ ] Set up health checks
- [ ] Configure proper error handling
- [ ] Set up monitoring
- [ ] Configure backup strategy

### Infrastructure Checklist
- [ ] Set up SSL certificates
- [ ] Configure firewall rules
- [ ] Set up reverse proxy
- [ ] Configure load balancing (if needed)
- [ ] Set up monitoring and alerting
- [ ] Configure backup and recovery
- [ ] Set up log aggregation
- [ ] Configure auto-scaling (if needed)

### Testing Checklist
- [ ] Load testing
- [ ] Security testing
- [ ] SSL/TLS testing
- [ ] Backup/restore testing
- [ ] Failover testing
- [ ] Performance testing

## 🚀 Deployment Steps

### 1. Server Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Configure firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

### 2. Application Deployment
```bash
# Clone repository
git clone <your-repo>
cd ngx_manager

# Create production environment file
cp .env.example .env
# Edit .env with production values

# Create necessary directories
mkdir -p logs
sudo mkdir -p /etc/letsencrypt
sudo mkdir -p /var/www/certbot

# Deploy application
docker-compose up -d

# Check logs
docker-compose logs -f
```

### 3. SSL Certificate Setup
```bash
# Initial certificate generation
docker-compose exec certbot certbot certonly --webroot --webroot-path=/var/www/certbot --email your-email@domain.com --agree-tos --no-eff-email -d yourdomain.com

# Reload nginx
docker-compose exec nginx nginx -s reload
```

## 📊 Monitoring & Maintenance

### 1. Log Monitoring
```bash
# Set up log rotation
sudo nano /etc/logrotate.d/ngx-manager
```

### 2. Backup Strategy
```bash
# Database backup script
#!/bin/bash
DOCKER_CONTAINER="ngx_manager_db"
BACKUP_DIR="/backups/mysql"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
docker exec $DOCKER_CONTAINER mysqldump -u root -p$MYSQL_ROOT_PASSWORD nginx_proxy_manager > $BACKUP_DIR/backup_$DATE.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete
```

### 3. Health Monitoring
```bash
# Add to crontab
*/5 * * * * curl -f http://localhost:5000/api/health || echo "Service down" | mail -s "NGX Manager Alert" admin@yourdomain.com
```

## 🔍 Security Hardening

### 1. Server Hardening
```bash
# Disable root login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Change SSH port
sudo sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Install fail2ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
```

### 2. Docker Security
```bash
# Run containers as non-root user
# Add to Dockerfiles:
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
USER nextjs
```

## ⚠️ Important Notes

1. **Change Default Credentials**: Immediately change the default admin credentials after first login
2. **Regular Updates**: Keep all dependencies and base images updated
3. **Backup Testing**: Regularly test backup and restore procedures
4. **Security Audits**: Perform regular security audits and penetration testing
5. **Monitoring**: Set up comprehensive monitoring and alerting
6. **Documentation**: Keep deployment and configuration documentation updated

## 📞 Emergency Procedures

### Service Recovery
```bash
# Quick service restart
docker-compose restart

# Full rebuild
docker-compose down
docker-compose up -d --build

# Database recovery
docker-compose exec db mysql -u root -p$MYSQL_ROOT_PASSWORD nginx_proxy_manager < /path/to/backup.sql
```

### Security Incident Response
1. Immediately change all passwords and secrets
2. Review access logs for suspicious activity
3. Update all dependencies
4. Rebuild and redeploy containers
5. Notify relevant stakeholders

This guide provides a comprehensive foundation for production deployment. Always test thoroughly in a staging environment before deploying to production.