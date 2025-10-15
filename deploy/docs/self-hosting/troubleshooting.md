# Worklenz Troubleshooting Guide

Comprehensive guide for diagnosing and resolving common issues with self-hosted Worklenz installations.

## Table of Contents

- [Diagnostic Tools](#diagnostic-tools)
- [Installation Issues](#installation-issues)
- [Service Issues](#service-issues)
- [Database Issues](#database-issues)
- [Storage Issues](#storage-issues)
- [Network & Connectivity Issues](#network--connectivity-issues)
- [Performance Issues](#performance-issues)
- [Security & SSL Issues](#security--ssl-issues)
- [Getting Help](#getting-help)

---

## Diagnostic Tools

### Built-in Status Dashboard

```bash
cd /opt/worklenz/deploy/docker/scripts
./status.sh              # One-time check
./status.sh --watch      # Live monitoring
./status.sh --json       # Machine-readable output
```

### View Service Logs

```bash
# All services
./logs.sh --follow

# Specific service
./logs.sh backend --tail 100

# Last hour
./logs.sh --since 1h

# Multiple services
./logs.sh backend worker
```

### Check Docker Status

```bash
# All containers
docker ps -a

# Specific service
docker ps -f name=worklenz_backend

# Resource usage
docker stats

# Network
docker network inspect worklenz_internal
```

### Check System Resources

```bash
# Disk space
df -h

# Memory
free -h

# CPU load
uptime
top

# Docker disk usage
docker system df
```

---

## Installation Issues

### Error: "Insufficient RAM"

**Symptoms**:
- Installer exits with memory error
- Services crash after starting

**Solution**:

1. **Check available RAM**:
```bash
free -h
```

2. **Add swap space** (if < 4GB RAM):
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

3. **Verify swap**:
```bash
free -h
swapon --show
```

### Error: "Docker not found"

**Symptoms**:
- "command not found: docker"
- Installer cannot proceed

**Solution**:

1. **Install Docker**:
```bash
curl -fsSL https://get.docker.com | sh
```

2. **Start Docker service**:
```bash
sudo systemctl start docker
sudo systemctl enable docker
```

3. **Verify installation**:
```bash
docker --version
docker compose version
```

4. **Add user to docker group** (optional):
```bash
sudo usermod -aG docker $USER
# Log out and back in
```

### Error: "Port 80 already in use"

**Symptoms**:
- "bind: address already in use"
- Nginx fails to start

**Solution**:

1. **Find process using port 80**:
```bash
sudo lsof -i :80
# or
sudo netstat -tulpn | grep :80
```

2. **Option A**: Stop conflicting service:
```bash
# Apache
sudo systemctl stop apache2
sudo systemctl disable apache2

# Nginx (host)
sudo systemctl stop nginx
sudo systemctl disable nginx
```

3. **Option B**: Use custom port:
```bash
# Edit worklenz.env
HTTP_PORT=8080

# Restart services
docker compose restart nginx
```

### Error: "Failed to pull Docker images"

**Symptoms**:
- "error pulling image"
- "connection timeout"

**Solution**:

1. **Check internet connection**:
```bash
ping -c 3 google.com
```

2. **Check Docker Hub connectivity**:
```bash
curl -I https://hub.docker.com
```

3. **Retry with timeout increase**:
```bash
export COMPOSE_HTTP_TIMEOUT=300
docker compose pull
```

4. **Use Docker mirror** (China):
```bash
# Edit /etc/docker/daemon.json
{
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"]
}

sudo systemctl restart docker
```

---

## Service Issues

### Service Not Starting

**Symptoms**:
- Container exits immediately
- Status shows "Exited (1)"

**Solution**:

1. **Check logs**:
```bash
cd /opt/worklenz
docker compose logs [service-name]
```

2. **Check health**:
```bash
docker compose ps
```

3. **Restart service**:
```bash
docker compose restart [service-name]
```

4. **Recreate container**:
```bash
docker compose up -d --force-recreate [service-name]
```

### Backend Crashes Repeatedly

**Symptoms**:
- Backend container restarts frequently
- "OOM killed" in logs

**Solution**:

1. **Check backend logs**:
```bash
docker compose logs backend --tail 200
```

2. **Common issues**:

**Database connection failed**:
```
Error: password authentication failed for user "worklenz"
```
→ Verify DB_PASSWORD in worklenz.env

**Out of memory**:
```
FATAL ERROR: ... JavaScript heap out of memory
```
→ Increase Node memory limit:
```yaml
# docker-compose.yml
services:
  backend:
    environment:
      NODE_OPTIONS: --max-old-space-size=2048
```

**Port conflict**:
```
Error: listen EADDRINUSE: address already in use :::3000
```
→ Check for duplicate backend containers:
```bash
docker ps -a | grep backend
docker rm [old-container-id]
```

### Worker Not Processing Jobs

**Symptoms**:
- Emails not sending
- Background tasks not running
- Worker logs show no activity

**Solution**:

1. **Check worker is running**:
```bash
docker compose ps worker
```

2. **Check worker logs**:
```bash
docker compose logs worker --follow
```

3. **Verify Redis connection**:
```bash
docker exec worklenz_worker node -e "
const Redis = require('ioredis');
const redis = new Redis({
  host: 'redis',
  port: 6379,
  password: process.env.REDIS_PASSWORD
});
redis.ping().then(() => console.log('Connected')).catch(e => console.error(e));
"
```

4. **Restart worker**:
```bash
docker compose restart worker
```

### All Services Down After Restart

**Symptoms**:
- `docker compose ps` shows all stopped
- Services don't auto-start

**Solution**:

1. **Check Docker daemon**:
```bash
sudo systemctl status docker
```

2. **Restart Docker**:
```bash
sudo systemctl restart docker
```

3. **Start all services**:
```bash
cd /opt/worklenz
docker compose up -d
```

4. **Check restart policy**:
```bash
docker inspect worklenz_backend | grep -A 5 RestartPolicy
# Should show: "Name": "unless-stopped"
```

---

## Database Issues

### Cannot Connect to Database

**Symptoms**:
- Backend logs: "connection refused"
- "database does not exist"

**Solution**:

1. **Check PostgreSQL is running**:
```bash
docker compose ps postgres
```

2. **Check PostgreSQL logs**:
```bash
docker compose logs postgres --tail 50
```

3. **Verify credentials**:
```bash
# Test connection
docker exec worklenz_postgres psql -U worklenz -d worklenz_db -c "SELECT 1;"
```

4. **Reset database password**:
```bash
# Stop backend
docker compose stop backend worker

# Connect to postgres
docker exec -it worklenz_postgres psql -U worklenz -d worklenz_db

# In psql:
ALTER USER worklenz WITH PASSWORD 'new_password';
\q

# Update worklenz.env with new password
# Restart services
docker compose start backend worker
```

### Database Corruption

**Symptoms**:
- "invalid page header"
- "could not open file"
- Data inconsistencies

**Solution**:

1. **Stop all services**:
```bash
docker compose down
```

2. **Restore from backup**:
```bash
cd deploy/docker/scripts
./restore.sh
# Select database backup
```

3. **If no backup, try repair** (last resort):
```bash
# Start only postgres
docker compose up -d postgres

# Run repair
docker exec worklenz_postgres pg_resetwal -f /var/lib/postgresql/data/pgdata
```

### Slow Database Queries

**Symptoms**:
- Slow page loads
- Timeout errors
- High CPU on postgres container

**Solution**:

1. **Check active queries**:
```bash
docker exec worklenz_postgres psql -U worklenz -d worklenz_db -c "
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;
"
```

2. **Kill long-running query**:
```bash
docker exec worklenz_postgres psql -U worklenz -d worklenz_db -c "
SELECT pg_terminate_backend([pid]);
"
```

3. **Run VACUUM**:
```bash
docker exec worklenz_postgres psql -U worklenz -d worklenz_db -c "VACUUM ANALYZE;"
```

4. **Increase connections**:
```bash
# In worklenz.env
DB_MAX_CONNECTIONS=100

# Restart
docker compose restart postgres backend
```

---

## Storage Issues

### File Upload Fails

**Symptoms**:
- "Failed to upload file"
- 413 Request Entity Too Large
- Timeout during upload

**Solution**:

1. **Check MinIO is running** (if embedded):
```bash
docker compose ps minio
docker compose logs minio
```

2. **Check bucket exists**:
```bash
docker exec worklenz_minio mc ls worklenz/worklenz-bucket
```

3. **Increase upload size limit**:
```bash
# In nginx.conf
client_max_body_size 100M;  # Increase from 100M to 500M

# Restart nginx
docker compose restart nginx
```

4. **Check disk space**:
```bash
df -h
docker system df
```

### Cannot Access Uploaded Files

**Symptoms**:
- Files uploaded but 404 when accessing
- Broken image links

**Solution**:

1. **Check MinIO is accessible**:
```bash
curl http://localhost:9000/minio/health/live
# Should return 200 OK
```

2. **Check bucket policy**:
```bash
docker exec worklenz_minio mc anonymous get worklenz/worklenz-bucket
# Should show: "public" or "download"
```

3. **Set public access**:
```bash
docker exec worklenz_minio mc anonymous set public worklenz/worklenz-bucket
```

4. **Verify file exists**:
```bash
docker exec worklenz_minio mc ls worklenz/worklenz-bucket/[path]
```

### MinIO Data Lost After Restart

**Symptoms**:
- All uploaded files gone
- Bucket doesn't exist

**Solution**:

1. **Check volume**:
```bash
docker volume ls | grep minio
docker volume inspect worklenz_minio_data
```

2. **Recreate bucket**:
```bash
docker compose up -d minio_setup
```

3. **Restore from backup** (if available):
```bash
cd deploy/docker/scripts
./restore.sh
# Select files backup
```

---

## Network & Connectivity Issues

### Cannot Access Frontend

**Symptoms**:
- Browser shows "Connection refused"
- "This site can't be reached"

**Solution**:

1. **Check Nginx is running**:
```bash
docker compose ps nginx
```

2. **Check port binding**:
```bash
docker port worklenz_nginx
# Should show: 80/tcp -> 0.0.0.0:80
```

3. **Check firewall**:
```bash
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

4. **Test from server**:
```bash
curl http://localhost
# Should return HTML
```

5. **Check DNS** (if using domain):
```bash
nslookup your-domain.com
# Should point to your server IP
```

### WebSocket Connection Failed

**Symptoms**:
- Real-time updates not working
- "WebSocket connection failed" in browser console

**Solution**:

1. **Check Socket.IO route in nginx**:
```bash
# In nginx.conf, ensure:
location /socket.io/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

2. **Check backend is accessible**:
```bash
curl http://localhost:3000/socket.io/
# Should return Socket.IO response
```

3. **Check CORS settings**:
```bash
# In worklenz.env
SOCKET_IO_CORS=https://your-domain.com
```

4. **Restart services**:
```bash
docker compose restart nginx backend
```

### SSL Certificate Errors

**Symptoms**:
- "Your connection is not private"
- "NET::ERR_CERT_AUTHORITY_INVALID"

**Solution**:

1. **Check certificate files**:
```bash
ls -la /opt/worklenz/deploy/docker/nginx/ssl/
# Should have cert.pem and key.pem
```

2. **Verify certificate**:
```bash
openssl x509 -in deploy/docker/nginx/ssl/cert.pem -text -noout
# Check expiry date, domains
```

3. **Renew Let's Encrypt**:
```bash
sudo certbot renew
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem deploy/docker/nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem deploy/docker/nginx/ssl/key.pem
docker compose restart nginx
```

4. **Test SSL**:
```bash
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

---

## Performance Issues

### Slow Page Load Times

**Symptoms**:
- Pages take > 5 seconds to load
- High latency

**Solution**:

1. **Check resource usage**:
```bash
docker stats
```

2. **Check database performance**:
```bash
# Enable slow query log
docker exec worklenz_postgres psql -U worklenz -d worklenz_db -c "
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();
"
```

3. **Increase cache size**:
```bash
# In worklenz.env
REDIS_MAX_MEMORY=512mb  # Increase from 256mb

docker compose restart redis
```

4. **Enable compression**:
```bash
# In nginx.conf - should already be enabled
gzip on;
gzip_comp_level 6;
```

### High Memory Usage

**Symptoms**:
- Server running out of memory
- OOM killer terminating processes

**Solution**:

1. **Identify memory hog**:
```bash
docker stats --no-stream | sort -k 4 -h -r
```

2. **Set memory limits**:
```yaml
# docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 1G
```

3. **Restart services**:
```bash
docker compose up -d --force-recreate
```

4. **Clean up Docker**:
```bash
docker system prune -a
docker volume prune
```

---

## Getting Help

### Before Asking for Help

1. **Check logs**:
```bash
./logs.sh --since 1h > logs.txt
```

2. **Collect system info**:
```bash
./status.sh --json > status.json
```

3. **Check configuration**:
```bash
# Remove secrets before sharing!
grep -v PASSWORD worklenz.env > env-sanitized.txt
```

### Support Channels

- **GitHub Issues**: [github.com/Worklenz/worklenz/issues](https://github.com/Worklenz/worklenz/issues)
- **GitHub Discussions**: [github.com/Worklenz/worklenz/discussions](https://github.com/Worklenz/worklenz/discussions)
- **Documentation**: `/deploy/docs/self-hosting/`

### Information to Include

When reporting issues, please provide:

1. **Environment**:
   - OS and version
   - Docker version
   - Docker Compose version
   - Installation method (one-command vs manual)

2. **Problem Description**:
   - What you expected
   - What actually happened
   - Steps to reproduce

3. **Logs** (last 100 lines):
```bash
./logs.sh [service] --tail 100
```

4. **Service Status**:
```bash
./status.sh
```

5. **Configuration** (sanitized):
   - Remove all passwords/secrets before sharing!

---

## Next Steps

- [Installation Guide](installation.md)
- [Architecture Overview](architecture.md)
- [Configuration Reference](configuration.md)
- [Backup & Restore](backup-restore.md)
