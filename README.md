# Nginx Proxy Manager

A modern, web-based interface for managing Nginx proxy configurations with automatic SSL certificate provisioning via Let's Encrypt.

## Features

- 🚀 **Modern Web Interface**: Built with Next.js 14 and ShadCN UI
- 🔒 **JWT Authentication**: Secure user authentication system
- 🌐 **Proxy Management**: Easy CRUD operations for proxy configurations
- 🔐 **SSL Automation**: Automatic Let's Encrypt certificate provisioning and renewal
- 📊 **Dashboard**: Real-time monitoring of proxies and SSL certificates
- 🐳 **Docker Ready**: Complete containerized deployment
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Domain names pointing to your server (for SSL certificates)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ngx_manager
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the services**
   ```bash
   docker-compose up -d
   ```

4. **Access the interface**
   - Open http://localhost in your browser
   - Default login: `admin@example.com` / `admin123`

## Architecture

### Services

- **Frontend (client)**: Next.js 14 application with ShadCN UI
- **Backend (server)**: Express.js API with TypeScript
- **Database (db)**: MySQL 8.0 for data persistence
- **Proxy (nginx)**: Nginx for reverse proxy and SSL termination
- **SSL (certbot)**: Automatic SSL certificate management

### Directory Structure

```
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── pages/             # Application pages
│   ├── hooks/             # Custom React hooks
│   └── utils/             # Utility functions
├── api/                   # Backend source code
│   ├── routes/            # API routes
│   ├── services/          # Business logic services
│   ├── middleware/        # Express middleware
│   └── utils/             # Backend utilities
├── docker/                # Docker configuration
│   ├── client/            # Frontend Dockerfile
│   ├── server/            # Backend Dockerfile
│   ├── nginx/             # Nginx configuration
│   └── mysql/             # Database initialization
└── supabase/migrations/   # Database migrations
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Proxy Management
- `GET /api/proxies` - List all proxies
- `POST /api/proxies` - Create new proxy
- `PUT /api/proxies/:id` - Update proxy
- `DELETE /api/proxies/:id` - Delete proxy

### SSL Certificates
- `GET /api/ssl` - List SSL certificates
- `POST /api/ssl/request` - Request new SSL certificate
- `POST /api/ssl/renew/:id` - Renew SSL certificate
- `DELETE /api/ssl/:id` - Delete SSL certificate
- `POST /api/ssl/revoke/:id` - Revoke SSL certificate

### Renewal System
- `GET /api/renewal/stats` - Get renewal statistics
- `GET /api/renewal/logs` - Get renewal logs
- `POST /api/renewal/check` - Trigger manual renewal check
- `GET /api/renewal/expiring` - List expiring certificates
- `GET /api/renewal/health` - System health status

## Configuration

### Environment Variables

See `.env.example` for all available configuration options.

### SSL Certificate Management

The system automatically:
- Generates temporary Nginx configurations for ACME challenges
- Obtains SSL certificates from Let's Encrypt
- Updates Nginx configurations with SSL settings
- Schedules automatic renewal (daily check for certificates expiring within 30 days)
- Logs all renewal activities

### Nginx Configuration

Proxy configurations are automatically generated and stored in `/etc/nginx/conf.d/`. Each proxy gets its own configuration file with:
- HTTP to HTTPS redirect
- SSL certificate configuration
- Proxy headers and settings
- Rate limiting (if configured)

## Development

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Start development servers**
   ```bash
   # Frontend
   npm run dev
   
   # Backend (in another terminal)
   cd api
   npm run dev
   ```

3. **Database setup**
   ```bash
   # Start MySQL with Docker
   docker-compose up db -d
   ```

### Building for Production

```bash
# Build frontend
npm run build

# Build backend
cd api
npm run build
```

## Deployment

### Docker Compose (Recommended)

```bash
# Production deployment
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Manual Deployment

1. Set up MySQL database
2. Configure Nginx with SSL
3. Deploy backend API server
4. Deploy frontend application
5. Set up Certbot for SSL automation

## Security Considerations

- Change default JWT secret in production
- Use strong database passwords
- Configure firewall rules
- Regular security updates
- Monitor access logs

## Troubleshooting

### Common Issues

1. **SSL Certificate Generation Fails**
   - Ensure domain points to your server
   - Check firewall allows port 80/443
   - Verify DNS propagation

2. **Database Connection Issues**
   - Check database credentials
   - Ensure database service is running
   - Verify network connectivity

3. **Nginx Configuration Errors**
   - Check Nginx syntax: `nginx -t`
   - Review error logs: `docker-compose logs nginx`
   - Verify file permissions

### Logs

```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs nginx
docker-compose logs server
docker-compose logs certbot
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the logs for error details