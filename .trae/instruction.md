---

## 🎯 Feature Breakdown & Prompts

---

### 1. 🔐 Authentication

> Create a user authentication system using Node.js (Express) and MySQL.
>
> - Use `bcrypt` to hash passwords
> - JWT for login/session handling
> - `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
>
> Client (Next.js + ShadCN):
> - Use `React Hook Form` for forms
> - Store JWT in memory or HttpOnly cookies

---

### 2. 🌐 Host Proxy Management

> Build REST API for proxy configuration:
>
> - `domain`: e.g., `app.example.com`
> - `target`: e.g., `http://localhost:3000`
> - `ssl`: boolean
>
> Backend (Express):
> - CRUD endpoints
> - Store config in MySQL
> - On create/update/delete:
>   - Generate NGINX conf
>   - Reload NGINX
>
> Client:
> - ShadCN UI to list, add, edit, delete proxies

---

### 3. 🔒 SSL Certificate with Let’s Encrypt

> Use Certbot to request SSL certs with HTTP-01 challenge:
>
> - After saving a proxy with `ssl: true`:
>   - Temporarily serve ACME challenge
>   - Call Certbot via child process
>   - On success, save cert path
>   - Update NGINX config to use SSL
>   - Reload NGINX

---

### 4. 🔁 SSL Auto-Renewal

> Create a background job or cron task in the server:
>
> - Use `certbot renew`
> - If certs renewed:
>   - Reload NGINX
>   - Log output
>
> Optional: store renewal status in database

---

### 5. 🐳 Docker Compose Setup

```yaml
version: '3.8'
services:
  client:
    build: ./client
    restart: unless-stopped
    depends_on:
      - server
    networks:
      - app

  server:
    build: ./server
    restart: unless-stopped
    depends_on:
      - db
    networks:
      - app
    environment:
      - DATABASE_URL=mysql://root:password@db:3306/proxy_manager

  nginx:
    image: nginx:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/sites:/etc/nginx/conf.d
      - ./certbot/www:/var/www/certbot
      - ./certbot/conf:/etc/letsencrypt
    depends_on:
      - client
      - server
    networks:
      - app

  certbot:
    image: certbot/certbot
    volumes:
      - ./certbot/www:/var/www/certbot
      - ./certbot/conf:/etc/letsencrypt
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do sleep 6h & wait $${!}; certbot renew --webroot -w /var/www/certbot; done;'"
    networks:
      - app

  db:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: proxy_manager
    volumes:
      - db_data:/var/lib/mysql
    networks:
      - app

volumes:
  db_data:

networks:
  app: