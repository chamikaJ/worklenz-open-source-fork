# Worklenz Deployment

This directory contains all deployment configurations and scripts for Worklenz self-hosted installations.

## Quick Start

### One-Command Installation (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/Worklenz/worklenz/main/deploy/docker/scripts/install.sh | bash
```

Or download and run locally:
```bash
wget https://raw.githubusercontent.com/Worklenz/worklenz/main/deploy/docker/scripts/install.sh
chmod +x install.sh
./install.sh
```

The installer will:
- ✅ Check system requirements (CPU, RAM, disk, Docker)
- ✅ Install Docker/Docker Compose if needed (Linux only)
- ✅ Run interactive configuration wizard
- ✅ Generate secure secrets automatically
- ✅ Configure storage backend (MinIO, S3, Azure)
- ✅ Pull and build Docker images
- ✅ Start all services with health checks
- ✅ Optionally setup SSL/Let's Encrypt

**Installation time:** 5-10 minutes

### Manual Installation

If you prefer manual setup:

1. **Generate Configuration**
   ```bash
   cd deploy/docker/scripts
   ./setup-env.sh
   ```
   This will create a `worklenz.env` file with secure random secrets.

2. **Start Services**
   ```bash
   docker-compose -f deploy/docker/compose/docker-compose.yml --env-file worklenz.env up -d
   ```

3. **Access Worklenz**
   - Open http://localhost (or your configured domain)
   - Login with credentials from setup script output

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- 4GB RAM (8GB recommended)
- 20GB disk space
- Linux (Ubuntu/Debian/CentOS) or macOS for installer

## Directory Structure

```
deploy/
├── docker/
│   ├── compose/
│   │   ├── docker-compose.yml          # Production configuration
│   │   ├── docker-compose.dev.yml      # Development (future)
│   │   └── docker-compose.minimal.yml  # Minimal setup (future)
│   ├── dockerfiles/
│   │   ├── backend.Dockerfile          # Backend API server
│   │   ├── frontend.Dockerfile         # Frontend React app
│   │   └── worker.Dockerfile           # Background worker
│   ├── nginx/
│   │   ├── nginx.conf                  # Nginx configuration
│   │   ├── ssl/                        # SSL certificates
│   │   └── certs/                      # Additional certificates
│   ├── scripts/
│   │   ├── install.sh                  # ⭐ One-command installer
│   │   ├── setup-env.sh                # Environment generator
│   │   ├── upgrade.sh                  # Automated upgrade script
│   │   ├── backup.sh                   # Backup and restore
│   │   ├── status.sh                   # Health dashboard
│   │   └── logs.sh                     # Log viewer
│   └── config/
│       └── worklenz.env.template       # Environment template
├── kubernetes/                         # Kubernetes manifests (future)
└── docs/
    └── self-hosting/                   # Self-hosting documentation
```

## Services

The production stack includes:

- **PostgreSQL 15**: Database
- **Redis 7**: Cache, sessions, Socket.IO adapter
- **MinIO**: S3-compatible object storage
- **Nginx**: Reverse proxy with SSL/TLS support
- **Backend API**: Express.js application
- **Backend Worker**: Background jobs and cron tasks
- **Frontend**: React application

## Configuration

All configuration is managed through the `worklenz.env` file.

**Key configuration options:**

- **Domain & URLs**: Set your domain name and SSL settings
- **Database**: Configure embedded or external PostgreSQL
- **Redis**: Configure embedded or external Redis
- **Storage**: Choose MinIO, S3, or Azure Blob Storage
- **Email**: SMTP or AWS SES configuration
- **Security**: All secrets auto-generated

See `deploy/docker/config/worklenz.env.template` for all available options.

## Storage Options

### Embedded MinIO (Default)
Best for: Quick start, small teams, < 50GB storage
- Runs in Docker container
- Data persisted in Docker volumes
- No external dependencies

### External S3-Compatible
Best for: Medium teams, 50GB-1TB storage
- DigitalOcean Spaces, Wasabi, Backblaze B2
- Better reliability and backups
- Update `worklenz.env` with endpoint and credentials

### AWS S3
Best for: Large teams, > 1TB storage, enterprise
- Managed by AWS
- Highly scalable and reliable
- Set `STORAGE_PROVIDER=s3` and configure credentials

### Azure Blob Storage
Best for: Azure ecosystem integration
- Managed by Microsoft Azure
- Geo-redundant storage
- Set `STORAGE_PROVIDER=azure` and configure

## Network Architecture

```
Internet
   ↓
Nginx (80/443) ← Only exposed port
   ↓
   ├→ Frontend (5000) ← Internal only
   ├→ Backend API (3000) ← Internal only
   └→ WebSocket (/socket.io/) ← Internal only
       ↓
       ├→ PostgreSQL (5432) ← Internal only
       ├→ Redis (6379) ← Internal only
       └→ MinIO (9000) ← Internal only
```

All services run in an internal Docker network. Only Nginx is exposed to the host.

## Management Commands

### Automated Scripts (Recommended)

#### Check System Status
```bash
cd deploy/docker/scripts
./status.sh              # One-time check
./status.sh --watch      # Live monitoring
./status.sh --json       # JSON output
```

Shows:
- Service health and uptime
- Resource usage (CPU, memory)
- Storage status and disk space
- Network connectivity
- Access URLs

#### View Logs
```bash
cd deploy/docker/scripts
./logs.sh                   # All logs
./logs.sh backend           # Specific service
./logs.sh --follow          # Follow logs (live)
./logs.sh backend --tail 100  # Last 100 lines
./logs.sh --since 1h        # Last hour
```

#### Backup Data
```bash
cd deploy/docker/scripts
./backup.sh                 # Full backup
./backup.sh --type db       # Database only
./backup.sh --type files    # Files only
./backup.sh --encrypt       # Encrypt with GPG
```

Creates backups of:
- PostgreSQL database
- Uploaded files (if using embedded MinIO)
- Configuration files
- Redis data

#### Upgrade to New Version
```bash
cd deploy/docker/scripts
./upgrade.sh                # Upgrade to latest
./upgrade.sh 1.6.0          # Upgrade to specific version
```

The upgrade script will:
- Display changelog
- Create pre-upgrade backup
- Download new version
- Rebuild Docker images
- Run database migrations
- Verify health
- Rollback on failure

### Manual Docker Compose Commands

#### View Logs
```bash
docker-compose -f deploy/docker/compose/docker-compose.yml logs -f [service]
```

#### Check Status
```bash
docker-compose -f deploy/docker/compose/docker-compose.yml ps
```

#### Stop Services
```bash
docker-compose -f deploy/docker/compose/docker-compose.yml down
```

#### Restart Service
```bash
docker-compose -f deploy/docker/compose/docker-compose.yml restart [service]
```

#### Update to Latest Version
```bash
docker-compose -f deploy/docker/compose/docker-compose.yml pull
docker-compose -f deploy/docker/compose/docker-compose.yml up -d
```

## Health Checks

All services include health checks:
- **PostgreSQL**: Ready when accepting connections
- **Redis**: Ready when responding to commands
- **MinIO**: Ready when API is accessible
- **Backend**: Health endpoint at `/health`
- **Frontend**: Root endpoint accessible
- **Nginx**: Health endpoint at `/health`

## Security Features

✅ Non-root container users
✅ Minimal Alpine-based images
✅ Internal-only network
✅ SSL/TLS support (Nginx)
✅ Auto-generated secure secrets
✅ Rate limiting (Nginx)
✅ Security headers
✅ WebSocket support (WSS)

## Troubleshooting

### Services won't start
```bash
# Check logs for errors
docker-compose -f deploy/docker/compose/docker-compose.yml logs

# Verify configuration
cat worklenz.env

# Check Docker resources
docker system df
```

### Can't access Worklenz
```bash
# Check if Nginx is running
docker-compose -f deploy/docker/compose/docker-compose.yml ps nginx

# Check Nginx logs
docker-compose -f deploy/docker/compose/docker-compose.yml logs nginx

# Verify port isn't in use
netstat -tuln | grep :80
```

### Database connection errors
```bash
# Check PostgreSQL status
docker-compose -f deploy/docker/compose/docker-compose.yml ps postgres

# Check database logs
docker-compose -f deploy/docker/compose/docker-compose.yml logs postgres

# Verify password in worklenz.env matches
```

### Storage upload failures
```bash
# Check MinIO status
docker-compose -f deploy/docker/compose/docker-compose.yml ps minio

# Check MinIO logs
docker-compose -f deploy/docker/compose/docker-compose.yml logs minio

# Verify bucket was created
docker-compose -f deploy/docker/compose/docker-compose.yml logs minio_setup
```

## Development vs Production

**Current Setup: Production-Ready**
- Multi-stage Docker builds
- Security hardening
- Health checks
- Resource limits
- Restart policies

**Future: Development Mode** (`docker-compose.dev.yml`)
- Hot reload for code changes
- Debug mode enabled
- Volume mounts for live editing
- Exposed database ports for debugging

## Scaling

### Horizontal Scaling (Future)
- Run multiple backend instances behind Nginx
- Redis adapter for Socket.IO clustering
- External PostgreSQL with read replicas
- CDN for frontend assets

### Vertical Scaling
- Increase Docker resource limits in compose file
- Adjust PostgreSQL connection pool size
- Increase Redis max memory
- Add more worker instances

## Backup & Restore

### Creating Backups

Use the automated backup script:
```bash
cd deploy/docker/scripts
./backup.sh --type full --output ./backups
```

Backup types:
- `full`: Database + files + config + Redis
- `db`: PostgreSQL database only
- `files`: Uploaded files (MinIO volume)
- `config`: Configuration files

Options:
- `--encrypt`: Encrypt backup with GPG
- `--output DIR`: Custom output directory

### Restoring Backups

**Database restore:**
```bash
# Stop services
docker-compose -f deploy/docker/compose/docker-compose.yml down

# Restore database
gunzip -c backups/database_TIMESTAMP.sql.gz | \
  docker exec -i worklenz_postgres psql -U worklenz -d worklenz_db

# Start services
docker-compose -f deploy/docker/compose/docker-compose.yml up -d
```

**Files restore (MinIO):**
```bash
# Stop MinIO
docker-compose -f deploy/docker/compose/docker-compose.yml stop minio

# Restore volume
docker run --rm \
  -v worklenz_minio_data:/data \
  -v $(pwd)/backups:/backup \
  alpine \
  tar xzf /backup/files_TIMESTAMP.tar.gz -C /

# Restart MinIO
docker-compose -f deploy/docker/compose/docker-compose.yml start minio
```

### Scheduled Backups

Add to crontab for automated daily backups:
```bash
0 2 * * * cd /opt/worklenz/deploy/docker/scripts && ./backup.sh --type full
```

## Migration from Old Docker Setup

If upgrading from the root `docker-compose.yml`:

1. **Export your data** (backup database and files)
2. **Stop old containers**: `docker-compose down`
3. **Run new setup**: Follow Quick Start above
4. **Restore data** if needed

## Support

- 📖 Documentation: `deploy/docs/self-hosting/`
- 🐛 Issues: [GitHub Issues](https://github.com/Worklenz/worklenz/issues)
- 💬 Community: [Discussions](https://github.com/Worklenz/worklenz/discussions)

## Roadmap

### ✅ Completed (Phase 1 & 2)
- ✅ One-command installation script (`install.sh`)
- ✅ Production-ready Docker setup
- ✅ Automated upgrade system (`upgrade.sh`)
- ✅ Backup and restore tools (`backup.sh`)
- ✅ Health monitoring dashboard (`status.sh`)
- ✅ Log management (`logs.sh`)
- ✅ Multiple storage backends (MinIO/S3/Azure)
- ✅ SSL/TLS support with Let's Encrypt
- ✅ Security hardening

### 🚧 Coming Soon (Phase 3+)
- 📝 Comprehensive self-hosting documentation
- 🔄 Automated restore script
- ☸️ Kubernetes deployment manifests
- 📊 Prometheus metrics integration
- 🚀 Platform-specific installers (AWS/DigitalOcean one-click)
- 🌐 Multi-node clustering support
- 💼 Enterprise features (HA, load balancing)

## License

See [LICENSE](../LICENSE) file in the project root.
