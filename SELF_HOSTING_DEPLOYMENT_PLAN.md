# Production-Grade Self-Hosted Deployment for Worklenz

## Overview
Implement a Plane.so-inspired self-hosted deployment system with one-command installation, production-ready configurations, and enterprise-grade management tools.

---

## Phase 1: Core Infrastructure Redesign

### 1.1 Create New Directory Structure
```
deploy/
├── docker/
│   ├── compose/
│   │   ├── docker-compose.yml (production)
│   │   ├── docker-compose.dev.yml
│   │   └── docker-compose.minimal.yml (express mode)
│   ├── dockerfiles/
│   │   ├── backend.Dockerfile
│   │   ├── frontend.Dockerfile
│   │   └── worker.Dockerfile (background jobs)
│   ├── nginx/
│   │   ├── nginx.conf.template
│   │   ├── ssl/
│   │   └── certs/
│   ├── scripts/
│   │   ├── install.sh (main installer)
│   │   ├── upgrade.sh
│   │   ├── backup.sh
│   │   ├── restore.sh
│   │   ├── status.sh
│   │   ├── logs.sh
│   │   ├── setup-buckets.sh (MinIO)
│   │   ├── migrate-storage.sh
│   │   └── setup-env.sh
│   └── config/
│       ├── worklenz.env.template
│       └── redis.conf
├── kubernetes/ (future)
└── docs/
    └── self-hosting/
        ├── installation.md
        ├── architecture.md
        ├── configuration.md
        ├── storage-backends.md
        ├── backup-restore.md
        ├── upgrade.md
        ├── troubleshooting.md
        └── security.md
```

### 1.2 Enhanced Docker Compose Configuration
**Services:**
- ✅ **PostgreSQL**: Database (existing, enhanced with health checks)
- ✅ **MinIO**: Object storage (existing, improved)
- ➕ **Redis**: Cache, session store, Socket.IO adapter (NEW)
- ➕ **Nginx**: Reverse proxy with SSL termination (NEW)
- ✅ **Backend API**: Express.js server (existing, enhanced)
- ➕ **Backend Worker**: Background jobs/cron (NEW)
- ✅ **Frontend**: React app (existing, enhanced)
- ➕ **MinIO Setup**: Automatic bucket creation (improved)

**Improvements:**
- Health checks for all services
- Named volumes for better data management
- Isolated internal network
- Restart policies (always/unless-stopped)
- Resource limits (CPU, memory)
- Dependency ordering
- Graceful shutdown (SIGTERM handling)

### 1.3 Production-Optimized Dockerfiles
- Multi-stage builds (reduce image size 60-70%)
- Security hardening (non-root users, minimal base images)
- Layer caching optimization
- Health check endpoints in apps
- Graceful shutdown signal handlers
- Build-time vs runtime environment separation

---

## Phase 2: One-Command Installation System

### 2.1 Main Installation Script (`install.sh`)
**Entry point:** `curl -fsSL https://raw.githubusercontent.com/Worklenz/worklenz/main/deploy/docker/scripts/install.sh | sh`

**Features:**
1. **System Requirements Check:**
   - CPU: 2+ cores
   - RAM: 4GB minimum, 8GB recommended
   - Disk: 20GB+ available
   - Docker: 20.10+
   - Docker Compose: 2.0+
   - OS: Linux (Ubuntu/Debian/CentOS/RHEL)
   - Architecture: x64, ARM64

2. **Interactive Configuration Wizard:**
   - Domain/hostname setup
   - HTTP vs HTTPS selection
   - Port configuration (default 80/443 or custom)
   - Installation mode selection (Express/Advanced)
   - **Storage backend selection** (see Phase 9)
   - Admin email and initial password
   - Email/SMTP configuration (optional)

3. **Installation Modes:**
   - **Express**: All services embedded, auto-config, 2-minute setup
   - **Advanced**: External services option, custom configs, granular control

4. **Automatic Setup:**
   - Generate secure secrets (JWT, session, cookies)
   - Create `worklenz.env` from template
   - Configure storage (MinIO or external)
   - Pull Docker images
   - Start services in correct order
   - Run database migrations
   - Create initial admin account
   - SSL certificate generation (Let's Encrypt optional)
   - Health check verification
   - Success message with access URLs

### 2.2 Environment Configuration Generator (`setup-env.sh`)
- Generate `worklenz.env` from template
- Automatic secret generation (32-character random strings)
- Validate configuration values (URLs, ports, credentials)
- Support for external services (managed DB, Redis, S3)
- Environment-specific configs (dev/staging/prod)
- Secure storage of sensitive values

---

## Phase 3: Management & Operations Tools

### 3.1 Upgrade Script (`upgrade.sh`)
```bash
./upgrade.sh [version]
```
- Check for new versions (GitHub releases)
- Display changelog
- Pre-upgrade health check
- Automatic backup before upgrade
- Pull new Docker images
- Run database migrations
- Graceful service restart (zero-downtime when possible)
- Post-upgrade verification
- Rollback on failure
- Upgrade history log

### 3.2 Backup Script (`backup.sh`)
```bash
./backup.sh [--type full|db|files|config]
```
- **Database backup**: pg_dump with compression
- **Environment configs**: All .env files
- **Uploaded files**: MinIO/S3 data export
- **Redis data**: RDB snapshot (optional)
- Backup encryption (GPG optional)
- Timestamp and versioning
- Scheduled backups via cron
- Retention policies
- Cloud backup sync (S3, Backblaze, etc.)
- Backup verification

### 3.3 Restore Script (`restore.sh`)
```bash
./restore.sh [backup-file]
```
- List available backups
- Restore database
- Restore uploaded files
- Restore configuration
- Verification and health checks
- Rollback capability

### 3.4 Service Management Scripts

**status.sh** - Health Dashboard:
```bash
./status.sh [--json|--watch]
```
- All service status (running/stopped)
- Container health checks
- Resource usage (CPU, memory, disk)
- Storage usage and availability
- Database connection status
- Redis connection status
- External service connectivity
- SSL certificate expiry
- Version information

**logs.sh** - Log Viewer:
```bash
./logs.sh [service] [--follow] [--tail 100]
```
- View logs for all or specific services
- Follow mode for real-time logs
- Log rotation status
- Error aggregation
- Export logs

**restart.sh** - Service Restart:
```bash
./restart.sh [service|all]
```
- Graceful restart (SIGTERM → wait → SIGKILL)
- Health check after restart
- Zero-downtime restart (rolling when possible)

**stop.sh** - Graceful Shutdown:
```bash
./stop.sh [--force]
```
- Drain connections
- Save state
- Stop services in correct order
- Force stop option

---

## Phase 4: Production Services Architecture

### 4.1 Nginx Reverse Proxy (NEW)
**Purpose:** Production-grade ingress

**Features:**
- SSL/TLS termination (Let's Encrypt, custom certs)
- WebSocket proxying (Socket.IO compatibility)
- Rate limiting (by IP, per route)
- Security headers (HSTS, CSP, X-Frame-Options)
- Gzip/Brotli compression
- Static file caching (frontend assets)
- Request buffering
- Load balancing (multiple backend instances)
- Access logs
- Error page customization
- HTTP/2 support

**Configuration:**
```nginx
upstream backend {
    server backend:3000;
    # Future: Multiple instances
}

upstream frontend {
    server frontend:5000;
}

server {
    listen 80;
    listen 443 ssl http2;

    # SSL config
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # WebSocket upgrade
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # API routes
    location /api/ {
        proxy_pass http://backend;
        # Rate limiting, security headers
    }

    # Frontend
    location / {
        proxy_pass http://frontend;
    }
}
```

### 4.2 Redis Integration (NEW)
**Purpose:** Cache, session store, Socket.IO scaling

**Use Cases:**
1. **Session Storage**: Express sessions in Redis
2. **Socket.IO Adapter**: Multi-instance support
3. **Caching Layer**: API response caching
4. **Background Jobs**: Bull/BullMQ queue
5. **Rate Limiting**: Request tracking

**Configuration:**
- Persistent storage (AOF + RDB)
- Password authentication
- Connection pooling
- Eviction policies (allkeys-lru)
- Max memory limits
- Health checks

**Backend Changes Required:**
- Update express-session to use connect-redis
- Configure Socket.IO Redis adapter
- Implement caching layer
- Add job queue system

### 4.3 Worker Service (NEW)
**Purpose:** Separate container for background processing

**Responsibilities:**
- **Cron Jobs**:
  - Email notifications (daily/weekly digests)
  - Recurring tasks automation
  - Report generation
  - Data cleanup
  - Analytics aggregation
- **Background Jobs**:
  - File exports (Excel, PDF)
  - Image processing
  - Email sending
  - Webhooks
  - Long-running operations

**Implementation:**
- Same codebase as API server
- Different entry point (`npm run worker`)
- Connects to same database and Redis
- Bull/BullMQ for job processing
- Scalable independently (0-N instances)
- Health checks (last job processed time)

**Dockerfile:**
```dockerfile
FROM node:20
# ... same build steps as backend ...
CMD ["npm", "run", "worker"]
```

### 4.4 Database Enhancements
**Improvements:**
- Connection pooling (50 connections)
- Health check endpoint
- Automatic migration runner on startup
- Backup scheduling
- Query performance monitoring (future)
- Read replicas support (future)
- PgBouncer for connection pooling (enterprise)

**Migration Runner:**
- Check migration status on startup
- Run pending migrations automatically
- Rollback capability
- Migration history table

### 4.5 Monitoring & Observability
**Health Endpoints:**
- `GET /health` - Liveness probe
- `GET /ready` - Readiness probe
- `GET /metrics` - Prometheus metrics (future)

**Logging:**
- Structured JSON logs
- Log levels (error, warn, info, debug)
- Request ID tracing
- Log aggregation to stdout (Docker logs)
- Optional: External logging (Loki, ELK)

**Metrics (Future):**
- Request rate, latency
- Error rates
- Database query performance
- Redis hit/miss ratio
- Storage usage
- Active users/sessions

---

## Phase 5: Security & Hardening

### 5.1 Container Security
- Non-root users in containers
- Read-only root filesystem where possible
- No privilege escalation
- Minimal base images (Alpine, Distroless)
- Regular security updates
- Image vulnerability scanning
- Drop unnecessary capabilities

### 5.2 Network Security
- Internal-only network for services
- Only Nginx exposed to host
- No direct database/Redis access from outside
- Firewall rules (UFW/iptables)
- Network policies

### 5.3 Secret Management
- Secrets generated automatically
- Not committed to version control
- Environment variable injection
- Optional: External secret manager (Vault, future)
- Secret rotation procedures

### 5.4 Application Security
- CSRF protection (existing)
- Rate limiting (Nginx + application level)
- Security headers (Nginx)
- HTTPS enforcement
- WSS for WebSockets
- HSTS with preload
- SQL injection prevention (parameterized queries)
- XSS protection (sanitize-html)
- Input validation

### 5.5 SSL/TLS
- Automatic Let's Encrypt certificates
- Certificate auto-renewal (certbot)
- Custom certificate support
- Strong cipher suites (TLS 1.2+)
- HTTPS redirect
- Certificate expiry monitoring

---

## Phase 6: Comprehensive Configuration System

### 6.1 Consolidated Environment File (`worklenz.env`)

**Structure:**
```bash
# ============================================
# CORE CONFIGURATION
# ============================================
WORKLENZ_VERSION=1.5.0
NODE_ENV=production
INSTALLATION_MODE=express  # express, standard, enterprise

# Domain & URLs
DOMAIN=worklenz.example.com
FRONTEND_URL=https://worklenz.example.com
BACKEND_URL=https://worklenz.example.com/api
USE_SSL=true

# Ports
HTTP_PORT=80
HTTPS_PORT=443
BACKEND_PORT=3000
FRONTEND_PORT=5000

# ============================================
# DATABASE CONFIGURATION
# ============================================
DATABASE_TYPE=embedded  # embedded, external
DB_HOST=postgres  # or external hostname
DB_PORT=5432
DB_NAME=worklenz_db
DB_USER=worklenz
DB_PASSWORD=auto_generated_secret_here
DB_MAX_CONNECTIONS=50
DB_SSL_MODE=prefer

# External Database (for standard/enterprise mode)
# DB_HOST=your-rds-endpoint.amazonaws.com
# DB_SSL_MODE=require

# ============================================
# REDIS CONFIGURATION
# ============================================
REDIS_TYPE=embedded  # embedded, external
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=auto_generated_secret_here
REDIS_DB=0
REDIS_MAX_MEMORY=256mb
REDIS_EVICTION_POLICY=allkeys-lru

# External Redis (for standard/enterprise mode)
# REDIS_HOST=your-redis-endpoint.amazonaws.com
# REDIS_TLS=true

# ============================================
# STORAGE CONFIGURATION
# ============================================
STORAGE_PROVIDER=minio  # minio, s3, azure

# MinIO (Embedded - Express Mode)
MINIO_TYPE=embedded  # embedded, external
MINIO_ENDPOINT=http://minio:9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=auto_generated_secret_here
MINIO_BUCKET=worklenz-files
MINIO_CONSOLE_PORT=9001
MINIO_USE_SSL=false

# S3-Compatible (External - Standard/Enterprise Mode)
# S3_ENDPOINT=https://s3.amazonaws.com
# S3_REGION=us-east-1
# S3_BUCKET=worklenz-files
# S3_ACCESS_KEY_ID=your_access_key
# S3_SECRET_ACCESS_KEY=your_secret_key
# S3_FORCE_PATH_STYLE=false
# S3_USE_SSL=true

# Azure Blob (Alternative)
# AZURE_STORAGE_ACCOUNT_NAME=
# AZURE_STORAGE_CONTAINER=worklenz-files
# AZURE_STORAGE_ACCOUNT_KEY=
# AZURE_STORAGE_URL=

# ============================================
# AUTHENTICATION & SECURITY
# ============================================
SESSION_SECRET=auto_generated_64_char_secret_here
SESSION_NAME=worklenz.sid
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_MAX_AGE=86400000

COOKIE_SECRET=auto_generated_64_char_secret_here
JWT_SECRET=auto_generated_64_char_secret_here
CSRF_SECRET=auto_generated_64_char_secret_here

# Google OAuth
GOOGLE_AUTH_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=

# ============================================
# EMAIL CONFIGURATION
# ============================================
EMAIL_ENABLED=false
EMAIL_PROVIDER=smtp  # smtp, ses

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@worklenz.example.com
SMTP_FROM_NAME=Worklenz

# AWS SES (Alternative)
# AWS_SES_REGION=us-east-1
# AWS_SES_ACCESS_KEY_ID=
# AWS_SES_SECRET_ACCESS_KEY=

# ============================================
# FEATURES & WORKERS
# ============================================
ENABLE_WORKERS=true
ENABLE_EMAIL_CRONJOBS=true
ENABLE_RECURRING_JOBS=true
RECURRING_JOBS_INTERVAL="0 11 */1 * 1-5"

# ============================================
# MONITORING & LOGGING
# ============================================
LOG_LEVEL=info  # error, warn, info, debug
ENABLE_ACCESS_LOGS=true
ENABLE_METRICS=false  # Prometheus metrics (future)

# ============================================
# RATE LIMITING
# ============================================
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# ============================================
# CORS
# ============================================
CORS_ORIGIN=*  # or specific domain
SOCKET_IO_CORS=${FRONTEND_URL}

# ============================================
# BACKUP CONFIGURATION
# ============================================
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"  # Daily at 2 AM
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION=false
BACKUP_CLOUD_SYNC=false
# BACKUP_CLOUD_PROVIDER=s3
# BACKUP_CLOUD_BUCKET=worklenz-backups

# ============================================
# ADMIN CONFIGURATION
# ============================================
ADMIN_EMAIL=admin@example.com
ADMIN_INITIAL_PASSWORD=auto_generated_password_here
CONTACT_US_EMAIL=support@example.com

# ============================================
# OPTIONAL INTEGRATIONS
# ============================================
GOOGLE_CAPTCHA_ENABLED=false
GOOGLE_CAPTCHA_SECRET_KEY=
GOOGLE_CAPTCHA_PASS_SCORE=0.8

SLACK_WEBHOOK=
SLACK_NOTIFICATIONS_ENABLED=false

# ============================================
# ADVANCED OPTIONS
# ============================================
USE_PG_NATIVE=false
TRUST_PROXY=true
HELMET_ENABLED=true
COMPRESSION_ENABLED=true
```

### 6.2 Configuration Modes

**Minimal/Express Mode:**
- All services embedded (Postgres, Redis, MinIO)
- Auto-configured defaults
- Best for: < 10 users, testing, development

**Standard Mode:**
- Embedded OR external services (user choice)
- More configuration options
- Best for: 10-50 users, small-medium teams

**Enterprise Mode:**
- External managed services recommended
- HA support, scaling, monitoring
- Best for: 50+ users, critical workloads

---

## Phase 7: Comprehensive Documentation

### 7.1 Self-Hosting Documentation Files

**docs/self-hosting/installation.md:**
- Quick start (one-command)
- System requirements
- Installation modes comparison
- Step-by-step wizard walkthrough
- Post-installation configuration
- Initial admin setup
- Troubleshooting installation issues

**docs/self-hosting/architecture.md:**
- Service architecture diagram
- Network topology
- Data flow diagrams
- Container communication
- Port mappings
- Technology stack

**docs/self-hosting/configuration.md:**
- Complete environment variable reference
- Configuration file locations
- Changing configuration post-install
- Feature flags
- Performance tuning
- Multi-instance setup

**docs/self-hosting/storage-backends.md:**
- Storage options comparison (MinIO vs S3 vs Azure)
- When to use which backend
- Configuration for each provider
- Migration between providers
- Performance considerations
- Cost comparison

**docs/self-hosting/backup-restore.md:**
- Backup strategy overview
- Manual backup procedures
- Automated backup setup
- Restoration procedures
- Disaster recovery plan
- Testing backups
- Cloud backup sync

**docs/self-hosting/upgrade.md:**
- Upgrade procedures
- Version compatibility
- Breaking changes (per version)
- Rollback procedures
- Zero-downtime upgrades
- Database migration handling

**docs/self-hosting/troubleshooting.md:**
- Common issues and solutions
- Service not starting
- Database connection errors
- Storage issues
- SSL/certificate problems
- Performance troubleshooting
- Log analysis
- Getting help

**docs/self-hosting/security.md:**
- Security best practices
- SSL/TLS setup
- Firewall configuration
- Secret management
- User permissions
- Network isolation
- Security hardening checklist
- Incident response

---

## Phase 8: Removal/Cleanup

### 8.1 Files to Remove
- ❌ Root `docker-compose.yml` (replace with new structure)
- ❌ `worklenz-backend/Dockerfile` (move to deploy/docker/dockerfiles/)
- ❌ `worklenz-frontend/Dockerfile` (move to deploy/docker/dockerfiles/)
- ❌ `start.sh` (replace with install.sh)
- ❌ `start.bat` (replace with install.sh)
- ❌ `stop.sh` (replace with deploy/docker/scripts/stop.sh)
- ❌ `stop.bat` (replace)
- ❌ `update-docker-env.sh` (functionality in new setup-env.sh)

### 8.2 Files to Update
- 📝 `README.md` - Update with new deployment instructions
- 📝 `SETUP_THE_PROJECT.md` - Point to new docs
- 📝 `.gitignore` - Add deploy/docker/config/worklenz.env

---

## Phase 9: File Storage Implementation Details

### 9.1 Storage Selection During Installation

**Interactive Prompts:**
```
Storage Backend Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Select your preferred storage backend:

1) Embedded MinIO (Recommended for getting started)
   - Self-contained, runs in Docker
   - Best for: < 50GB storage, small teams
   - Pros: Easy setup, no external dependencies
   - Cons: Limited scalability, backup complexity

2) External S3-Compatible (MinIO, DigitalOcean Spaces, Wasabi)
   - Connect to external S3-compatible service
   - Best for: Medium teams, 50GB-1TB
   - Pros: Better reliability, easier backups
   - Cons: Requires external service setup

3) AWS S3 (Managed cloud storage)
   - Amazon's object storage service
   - Best for: Large teams, > 1TB, enterprise
   - Pros: Highly scalable, reliable, integrations
   - Cons: Cloud dependency, ongoing costs

4) Azure Blob Storage (Managed cloud storage)
   - Microsoft's object storage service
   - Best for: Azure ecosystem, enterprise
   - Pros: Azure integration, geo-redundancy
   - Cons: Cloud dependency, ongoing costs

Choice [1-4]: _
```

**Based on Selection:**

**Option 1 (Embedded MinIO):**
```
MinIO Configuration
━━━━━━━━━━━━━━━━━
Configuring embedded MinIO...

✓ Root username: minioadmin
✓ Root password: [auto-generated]
✓ Bucket name: worklenz-files
✓ Storage path: ./data/minio
✓ Console port: 9001

Would you like to enable scheduled backups? [Y/n]: _
```

**Option 2 (External S3-Compatible):**
```
S3-Compatible Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━
Enter your S3-compatible service details:

Endpoint URL: https://your-minio.example.com
Region: us-east-1
Access Key ID: ********************
Secret Access Key: ****************************************
Bucket Name: worklenz-files
Use SSL [Y/n]: Y

Testing connection... ✓ Connected successfully
```

**Option 3 (AWS S3):**
```
AWS S3 Configuration
━━━━━━━━━━━━━━━━━━
Enter your AWS credentials:

AWS Region: us-east-1
S3 Bucket Name: my-worklenz-bucket
AWS Access Key ID: AKIA****************
AWS Secret Access Key: ****************************************

Testing connection... ✓ Connected successfully
✓ Bucket exists and is accessible
```

**Option 4 (Azure Blob):**
```
Azure Blob Storage Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Enter your Azure Storage details:

Storage Account Name: worklenzfiles
Container Name: worklenz-container
Account Key: ****************************************
Storage URL [auto]: https://worklenzfiles.blob.core.windows.net

Testing connection... ✓ Connected successfully
```

### 9.2 Docker Compose Storage Configurations

**Express Mode (Embedded MinIO):**
```yaml
services:
  minio:
    image: minio/minio:latest
    container_name: worklenz_minio
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - worklenz_minio_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    networks:
      - worklenz_internal
    # Not exposed to host - internal only

  minio_setup:
    image: minio/mc
    container_name: worklenz_minio_setup
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: /scripts/setup-buckets.sh
    volumes:
      - ./scripts/setup-buckets.sh:/scripts/setup-buckets.sh:ro
    environment:
      MINIO_ENDPOINT: http://minio:9000
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      MINIO_BUCKET: ${MINIO_BUCKET}
    networks:
      - worklenz_internal

volumes:
  worklenz_minio_data:
    driver: local
```

**Standard/Enterprise Mode (External Storage):**
```yaml
# MinIO service not included
# Backend connects directly to external endpoint via environment variables
```

### 9.3 Storage Migration Script

**deploy/docker/scripts/migrate-storage.sh:**
```bash
#!/bin/bash
# Migrate files between storage backends

# Usage:
#   ./migrate-storage.sh minio s3
#   ./migrate-storage.sh s3 azure

SOURCE_TYPE=$1
DEST_TYPE=$2

# Read current config
# Export from source (mc mirror, aws s3 sync, azcopy)
# Import to destination
# Update worklenz.env
# Test connectivity
# Switch over (update backend config)
# Verify files accessible
```

### 9.4 Storage Health Monitoring

**In status.sh:**
```bash
# Storage Health Check
if [ "$STORAGE_PROVIDER" = "minio" ]; then
  if [ "$MINIO_TYPE" = "embedded" ]; then
    # Check MinIO container
    # Check disk usage
    # Check connectivity
    echo "✓ MinIO: Running (15.2GB / 50GB used)"
  else
    # Check external MinIO
    echo "✓ External MinIO: Connected"
  fi
elif [ "$STORAGE_PROVIDER" = "s3" ]; then
  # Test S3 connectivity
  echo "✓ AWS S3: Connected (bucket: $S3_BUCKET)"
elif [ "$STORAGE_PROVIDER" = "azure" ]; then
  # Test Azure connectivity
  echo "✓ Azure Blob: Connected (container: $AZURE_CONTAINER)"
fi

# Test upload/download
echo "Testing storage read/write..."
# Upload test file
# Download test file
# Delete test file
echo "✓ Storage read/write: OK"
```

### 9.5 Backup Strategy by Storage Type

**Embedded MinIO:**
```bash
# backup.sh includes:
1. Stop MinIO (optional, or use mc mirror during runtime)
2. Export bucket: mc mirror myminio/worklenz-bucket ./backup/files/
3. Compress: tar -czf files-$(date +%Y%m%d).tar.gz ./backup/files/
4. Encrypt (optional): gpg --encrypt files-$(date +%Y%m%d).tar.gz
5. Upload to cloud backup (optional): aws s3 cp ... or rclone sync
6. Clean up old backups based on retention policy
```

**External S3/Azure:**
```bash
# Backup handled by cloud provider features:
- AWS S3: Enable versioning, lifecycle policies, cross-region replication
- Azure: Soft delete, geo-redundant storage, lifecycle management

# Or use native tools:
- S3: aws s3 sync s3://source s3://backup
- Azure: azcopy sync ...

# Application backup.sh focuses on metadata:
- Database export (links to storage objects)
- Configuration files
```

### 9.6 Backend Code Updates Required

**Update storage client initialization:**
```typescript
// src/config/storage.ts
import { S3Client } from '@aws-sdk/client-s3';
import { BlobServiceClient } from '@azure/storage-blob';

export function initializeStorage() {
  const provider = process.env.STORAGE_PROVIDER;

  if (provider === 'minio' || provider === 's3') {
    return new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    });
  } else if (provider === 'azure') {
    return BlobServiceClient.fromConnectionString(
      process.env.AZURE_CONNECTION_STRING!
    );
  }

  throw new Error(`Unsupported storage provider: ${provider}`);
}
```

**Add health check endpoint:**
```typescript
// src/controllers/health-controller.ts
export async function checkStorageHealth(req, res) {
  try {
    // Test connectivity
    // Test upload/download
    // Check available space (MinIO only)
    res.json({ status: 'ok', storage: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', error: error.message });
  }
}
```

### 9.7 Storage Decision Tree
```
Team Size < 10 users, < 50GB files → Embedded MinIO
Team Size 10-50 users, < 500GB files → External MinIO or S3-compatible
Team Size > 50 users, > 500GB files → AWS S3 / Azure Blob (managed)
Compliance/Air-gapped → Self-hosted MinIO cluster
```

---

## Phase 10: Implementation Order & Timeline

### Week 1: Infrastructure Foundation
1. Create directory structure
2. Build production Dockerfiles (backend, frontend, worker)
3. Create docker-compose.yml with all services (PostgreSQL, Redis, MinIO, Nginx, backend, worker, frontend)
4. Configure Nginx with SSL support
5. Test local deployment

### Week 2: Configuration & Environment System
6. Create worklenz.env.template (comprehensive)
7. Build setup-env.sh (environment generator)
8. Implement storage backend configuration
9. Add health check endpoints to backend
10. Test configuration variations

### Week 3: Installation System
11. Create install.sh (interactive wizard, 500-800 lines)
12. Implement system requirements checker
13. Add storage backend selection flow
14. Test installation on clean VMs (Ubuntu, Debian, CentOS)
15. Add error handling and rollback

### Week 4: Management Tools
16. Create upgrade.sh (version management, migrations)
17. Build backup.sh (database, files, configs)
18. Build restore.sh
19. Create status.sh (health dashboard)
20. Create logs.sh (log viewer)
21. Test backup/restore workflows

### Week 5: Backend Enhancements
22. Add Redis session store
23. Implement Socket.IO Redis adapter
24. Create worker service entry point
25. Migrate cron jobs to worker
26. Add storage health checks

### Week 6: Documentation & Testing
27. Write installation.md
28. Write architecture.md
29. Write configuration.md
30. Write storage-backends.md
31. Write backup-restore.md
32. Write troubleshooting.md
33. End-to-end testing on multiple platforms

### Week 7: Migration & Cleanup
34. Test upgrade path from old Docker setup
35. Remove old Docker files
36. Update README.md
37. Update SETUP_THE_PROJECT.md
38. Create migration guide

### Week 8: Final Polish & Release
39. Security audit
40. Performance testing
41. Load testing
42. Final documentation review
43. Create release notes
44. Tag release v2.0.0

---

## Success Criteria

✅ **One-Command Installation:**
   - `curl -fsSL https://raw.githubusercontent.com/Worklenz/worklenz/main/deploy/docker/scripts/install.sh | sh`
   - Complete setup in < 5 minutes (Express mode)

✅ **Production-Ready Out of the Box:**
   - SSL/TLS configured
   - Health monitoring included
   - Automated backups
   - Security hardened

✅ **Flexible Storage:**
   - Embedded MinIO for quick start
   - External storage for scale
   - Migration between backends

✅ **Enterprise Features:**
   - External service support
   - High availability capable
   - Monitoring & observability
   - Automated upgrades

✅ **Complete Documentation:**
   - Installation guides
   - Architecture docs
   - Configuration reference
   - Troubleshooting guides

✅ **Operational Excellence:**
   - Easy upgrades
   - Reliable backups
   - Health monitoring
   - Log management

✅ **Similar Experience to Plane.so:**
   - Professional deployment
   - Production-grade infrastructure
   - Enterprise-ready
   - Community-friendly

---

## File Creation Checklist

### Configuration Files (8 files)
- [ ] `deploy/docker/config/worklenz.env.template`
- [ ] `deploy/docker/config/redis.conf`
- [ ] `deploy/docker/nginx/nginx.conf.template`
- [ ] `deploy/docker/compose/docker-compose.yml`
- [ ] `deploy/docker/compose/docker-compose.dev.yml`
- [ ] `deploy/docker/compose/docker-compose.minimal.yml`
- [ ] `.gitignore` (update)
- [ ] `.dockerignore` (new)

### Dockerfiles (3 files)
- [ ] `deploy/docker/dockerfiles/backend.Dockerfile`
- [ ] `deploy/docker/dockerfiles/frontend.Dockerfile`
- [ ] `deploy/docker/dockerfiles/worker.Dockerfile`

### Scripts (10 files)
- [ ] `deploy/docker/scripts/install.sh` ⭐ CRITICAL
- [ ] `deploy/docker/scripts/setup-env.sh`
- [ ] `deploy/docker/scripts/setup-buckets.sh`
- [ ] `deploy/docker/scripts/upgrade.sh`
- [ ] `deploy/docker/scripts/backup.sh`
- [ ] `deploy/docker/scripts/restore.sh`
- [ ] `deploy/docker/scripts/status.sh`
- [ ] `deploy/docker/scripts/logs.sh`
- [ ] `deploy/docker/scripts/restart.sh`
- [ ] `deploy/docker/scripts/migrate-storage.sh`

### Documentation (9 files)
- [ ] `docs/self-hosting/README.md`
- [ ] `docs/self-hosting/installation.md`
- [ ] `docs/self-hosting/architecture.md`
- [ ] `docs/self-hosting/configuration.md`
- [ ] `docs/self-hosting/storage-backends.md`
- [ ] `docs/self-hosting/backup-restore.md`
- [ ] `docs/self-hosting/upgrade.md`
- [ ] `docs/self-hosting/troubleshooting.md`
- [ ] `docs/self-hosting/security.md`

### Backend Code Changes (5 files)
- [ ] `worklenz-backend/src/config/storage.ts` (new)
- [ ] `worklenz-backend/src/config/redis.ts` (update)
- [ ] `worklenz-backend/src/controllers/health-controller.ts` (new)
- [ ] `worklenz-backend/src/bin/worker.ts` (new entry point)
- [ ] `worklenz-backend/package.json` (add worker script)

### Updated Files
- [ ] `README.md` (complete rewrite of deployment section)
- [ ] `SETUP_THE_PROJECT.md` (update or redirect)

### Files to Remove (7 files)
- [ ] `docker-compose.yml` (root)
- [ ] `worklenz-backend/Dockerfile`
- [ ] `worklenz-frontend/Dockerfile`
- [ ] `start.sh`
- [ ] `start.bat`
- [ ] `stop.sh`
- [ ] `update-docker-env.sh`

**Total: 42 new files, 3 updated, 7 removed**

---

## Comparison to Plane.so Implementation

### What We're Adopting from Plane.so:
✅ One-command installation script
✅ Express vs Advanced installation modes
✅ Interactive configuration wizard
✅ Production-first architecture (Nginx, Redis, Workers)
✅ Comprehensive environment management
✅ Management scripts (upgrade, backup, status)
✅ Support for external managed services
✅ SSL/TLS by default
✅ Health monitoring built-in
✅ Professional documentation structure

### Where We're Improving/Different:
➕ More detailed storage backend selection (4 options vs 2)
➕ Enhanced backup/restore with encryption
➕ Better Windows support (current Docker setup works on Windows)
➕ More granular configuration options
➕ Built-in migration tools (storage, database)
➕ Detailed health dashboard (status.sh)
➕ Open source from day one (no commercial/community split)

### What We're Not Implementing (Yet):
❌ Kubernetes deployment (future)
❌ Air-gapped installation (future)
❌ Platform-native installers (AWS/DO one-click)
❌ Prometheus metrics (future)
❌ Multi-node clustering (future)

---

## Next Steps After Plan Approval

1. ✅ **Planning Complete** - This document
2. Create project structure (directories)
3. Start with Phase 1 (Docker infrastructure)
4. Build and test incrementally
5. Prioritize install.sh as critical path
6. Continuous testing on clean VMs
7. Document as we build
8. Review and iterate

Ready to begin implementation!
