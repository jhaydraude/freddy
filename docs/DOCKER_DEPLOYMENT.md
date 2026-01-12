# Docker Deployment Guide

## Overview

Freddy (The Intelligent Loop Manager) can be deployed using Docker for easy setup and consistent environments across development, testing, and production.

**Repository**: https://github.com/jhaydraude/freddy

---

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- External MongoDB instance (MongoDB Atlas, self-hosted, or existing Nightscout database)
- Git

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/jhaydraude/freddy.git
cd freddy
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env.production

# Edit with your MongoDB URI and API keys
nano .env.production
```

Required environment variables:
- `MONGO_URI` - Your MongoDB connection string
- `GEMINI_API_KEY` - Google Gemini API key (for AI features)

### 3. Build and Run

```bash
# Build containers
docker compose build

# Start services
docker compose up -d

# View logs
docker compose logs -f
```

### 4. Access Application

- **WebApp**: http://localhost:3000
- **Prediction API**: http://localhost:8000
- **API Docs**: http://localhost:3000/apidocs

---

## Architecture

### Services

1. **freddy-webapp** (Port 3000)
   - Next.js web application
   - User interface for diabetes management
   - API endpoints for data access

2. **freddy-prediction** (Port 8000)
   - Python FastAPI service
   - Profile analysis and predictions
   - Machine learning models

3. **External MongoDB**
   - Not containerized
   - Managed separately (Atlas, self-hosted, or existing)

### Network

Services communicate via Docker bridge network `freddy`:
- WebApp → Prediction Service: `http://prediction-service:8000`
- Both services → MongoDB: External connection via `MONGO_URI`

---

## MongoDB Setup

### Option 1: MongoDB Atlas (Recommended)

1. Create free cluster at https://cloud.mongodb.com
2. Create database user with read/write permissions
3. Whitelist your server's IP address
4. Get connection string:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/nightscout
   ```

### Option 2: Existing Nightscout Database

If you already have Nightscout running:
```env
MONGO_URI=mongodb://your-nightscout-host:27017/nightscout
```

Freddy will use the same database - no migration needed.

### Option 3: Self-Hosted MongoDB

```bash
# Install MongoDB
sudo apt-get install mongodb-org

# Start MongoDB
sudo systemctl start mongod

# Create database and user
mongosh
> use nightscout
> db.createUser({
    user: "freddy",
    pwd: "secure_password",
    roles: ["readWrite"]
  })

# Connection string
MONGO_URI=mongodb://freddy:secure_password@localhost:27017/nightscout
```

---

## Environment Configuration

### Development (.env)

```env
MONGO_URI=mongodb://localhost:27017/nightscout
PREDICTION_SERVICE_URL=http://localhost:8000
GEMINI_API_KEY=your_api_key
NODE_ENV=development
```

### Production (.env.production)

```env
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/nightscout
PREDICTION_SERVICE_URL=http://prediction-service:8000
GEMINI_API_KEY=your_api_key
NODE_ENV=production
```

**Important**: Never commit `.env.production` to Git!

---

## Deployment

### Local Testing

```bash
# Build containers
docker compose build

# Start in foreground (see logs)
docker compose up

# Start in background
docker compose up -d

# Stop services
docker compose down
```

### Production Deployment

#### Initial Setup

```bash
# On test server
git clone https://github.com/jhaydraude/freddy.git /opt/freddy
cd /opt/freddy

# Configure environment
cp .env.example .env.production
nano .env.production

# Make deploy script executable
chmod +x deploy.sh

# Deploy
./deploy.sh
```

#### Updates

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
./deploy.sh
```

#### From Development Machine

```bash
# SSH and deploy
ssh user@server "cd /opt/freddy && git pull && ./deploy.sh"

# Or use deploy script
./deploy.bat
```

---

## Docker Commands

### Container Management

```bash
# List running containers
docker compose ps

# View logs
docker compose logs -f
docker compose logs -f webapp
docker compose logs -f prediction-service

# Restart services
docker compose restart
docker compose restart webapp

# Stop services
docker compose down

# Remove containers and volumes
docker compose down -v
```

### Building

```bash
# Build all services
docker compose build

# Build specific service
docker compose build webapp

# Build without cache
docker compose build --no-cache

# Build and start
docker compose up -d --build
```

### Debugging

```bash
# Execute command in container
docker exec freddy-webapp sh
docker exec freddy-prediction bash

# View environment variables
docker exec freddy-webapp env

# Check MongoDB connection
docker exec freddy-webapp sh -c 'echo $MONGO_URI'
```

---

## Health Checks

### WebApp Health

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "freddy-webapp",
  "database": "connected",
  "timestamp": "2026-01-08T23:00:00.000Z"
}
```

### Prediction Service Health

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "freddy-prediction"
}
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs for errors
docker compose logs webapp

# Check container status
docker ps -a

# Rebuild from scratch
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

### MongoDB Connection Failed

```bash
# Test connection from host
mongosh "$MONGO_URI" --eval "db.adminCommand('ping')"

# Check environment variable
docker exec freddy-webapp sh -c 'echo $MONGO_URI'

# For MongoDB Atlas:
# - Verify IP is whitelisted
# - Check username/password
# - Ensure connection string is correct
```

### Port Already in Use

```bash
# Check what's using the port
netstat -tulpn | grep :3000
netstat -tulpn | grep :8000

# Change ports in docker compose.yml
ports:
  - "3001:3000"  # Map to different host port
```

### Build Fails

```bash
# Check disk space
df -h

# Clean up Docker
docker system prune -a

# Check Docker version
docker --version
docker compose --version
```

---

## Performance Optimization

### Resource Limits

Add to `docker compose.yml`:

```yaml
services:
  webapp:
    # ... existing config
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Caching

Docker uses layer caching. To optimize:
- Dependencies are cached separately from source code
- Only rebuild when package files change
- Use `.dockerignore` to exclude unnecessary files

---

## Security Best Practices

1. **Environment Variables**
   - Never commit `.env.production`
   - Use strong passwords
   - Rotate API keys regularly

2. **MongoDB**
   - Enable authentication
   - Use SSL/TLS connections
   - Whitelist only necessary IPs
   - Regular backups

3. **Docker**
   - Run containers as non-root user (already configured)
   - Keep base images updated
   - Scan for vulnerabilities: `docker scan freddy-webapp`

4. **Network**
   - Use firewall to restrict ports
   - Only expose necessary ports (3000, 8000)
   - Use reverse proxy (nginx) for SSL in production

---

## Monitoring

### Container Stats

```bash
# Real-time stats
docker stats

# Specific container
docker stats freddy-webapp
```

### Logs

```bash
# Follow logs
docker compose logs -f

# Last 100 lines
docker compose logs --tail=100

# Since specific time
docker compose logs --since 2024-01-08T10:00:00
```

---

## Backup and Recovery

### Database Backup

MongoDB backups should be handled by your MongoDB provider:
- **MongoDB Atlas**: Automatic backups included
- **Self-hosted**: Use `mongodump` regularly

### Application Backup

```bash
# Backup environment config
cp .env.production .env.production.backup

# Export container images
docker save freddy-webapp:latest | gzip > freddy-webapp.tar.gz
docker save freddy-prediction:latest | gzip > freddy-prediction.tar.gz
```

### Recovery

```bash
# Restore from Git
git checkout v1.0.0
./deploy.sh

# Restore container images
docker load < freddy-webapp.tar.gz
docker compose up -d
```

---

## Updating

### Minor Updates

```bash
git pull origin main
docker compose up -d --build
```

### Major Updates

```bash
# Tag current version
git tag -a v1.0.0 -m "Stable version"

# Pull updates
git pull origin main

# Test in separate environment first
docker compose -f docker compose.test.yml up

# Deploy
./deploy.sh
```

---

## Additional Resources

- **GitHub Repository**: https://github.com/jhaydraude/freddy
- **Docker Documentation**: https://docs.docker.com
- **MongoDB Atlas**: https://cloud.mongodb.com
- **Next.js Deployment**: https://nextjs.org/docs/deployment

---

## Support

For issues or questions:
1. Check logs: `docker compose logs -f`
2. Review troubleshooting section above
3. Check GitHub issues
4. Verify MongoDB connectivity
