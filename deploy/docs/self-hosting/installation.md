# Worklenz Self-Hosted Installation Guide

Complete guide for installing and configuring Worklenz on your own infrastructure.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
- [One-Command Installation](#one-command-installation)
- [Manual Installation](#manual-installation)
- [Post-Installation](#post-installation)
- [Configuration Modes](#configuration-modes)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

**Minimum:**
- **CPU**: 2 cores
- **RAM**: 4GB
- **Disk**: 20GB available space
- **OS**: Linux (Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+)
- **Architecture**: x86_64 (amd64) or ARM64

**Recommended:**
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Disk**: 50GB+ SSD
- **OS**: Ubuntu 22.04 LTS or Debian 12

### Software Requirements

- **Docker**: 20.10 or later
- **Docker Compose**: 2.0 or later (v2 plugin or standalone)
- **curl** or **wget**: For downloading installation script
- **OpenSSL**: For generating secrets (usually pre-installed)

### Network Requirements

- **Ports**:
  - Port 80 (HTTP) - Required
  - Port 443 (HTTPS) - Required if using SSL
- **Outbound Internet**: Required for Docker image downloads
- **Domain Name**: Optional but recommended for production

### Before You Begin

1. **Backup any existing data** if upgrading from a previous installation
2. **Ensure ports 80/443 are available** and not used by other services
3. **Have your domain DNS configured** if using a custom domain
4. **Prepare storage credentials** if using external S3/Azure storage

---

## Installation Methods

Worklenz offers two installation methods:

### 1. One-Command Installation (Recommended)

- **Best for**: Most users, quick setup, production deployments
- **Time**: 5-10 minutes
- **Features**: Automated system checks, Docker installation, interactive wizard, SSL setup
- **Command**: Single curl/wget command

### 2. Manual Installation

- **Best for**: Advanced users, custom configurations, airgapped environments
- **Time**: 15-30 minutes
- **Features**: Full control over each step, custom modifications
- **Method**: Step-by-step Docker Compose setup

---

## One-Command Installation

### Quick Start

Run the following command on your server:

```bash
curl -fsSL https://raw.githubusercontent.com/Worklenz/worklenz/main/deploy/docker/scripts/install.sh | bash
```

Or download and inspect before running:

```bash
wget https://raw.githubusercontent.com/Worklenz/worklenz/main/deploy/docker/scripts/install.sh
chmod +x install.sh
./install.sh
```

### Installation Steps

The installer will:

#### 1. System Requirements Check

Validates:
- CPU cores (minimum 2)
- RAM (minimum 4GB)
- Disk space (minimum 20GB)
- Architecture (amd64 or arm64)
- Operating system compatibility

#### 2. Docker Installation (if needed)

On Ubuntu/Debian systems, the installer can automatically install:
- Docker Engine
- Docker Compose Plugin
- Configure Docker service
- Add current user to docker group

**Note**: You may need to log out and back in for group changes to take effect.

#### 3. Configuration Wizard

Choose your installation mode:

**Express Mode** (Recommended for quick setup):
- All services embedded (PostgreSQL, Redis, MinIO)
- Automatic configuration
- Minimal prompts
- Best for: Testing, development, small teams (< 10 users)

**Advanced Mode** (For production):
- Choose embedded or external services
- Configure storage backend (MinIO, S3, Azure)
- SSL/TLS setup
- Email/SMTP configuration
- Best for: Production deployments, larger teams

#### 4. Storage Backend Selection

Choose from:

1. **Embedded MinIO** (Default)
   - Runs in Docker
   - Best for: < 50GB storage
   - Pros: Simple, no external dependencies
   - Cons: Backup complexity, limited scalability

2. **External MinIO**
   - Connect to external MinIO instance
   - Best for: 50GB-500GB storage
   - Requires: MinIO endpoint, access keys

3. **AWS S3**
   - Amazon's object storage
   - Best for: > 500GB, enterprise
   - Requires: AWS access key ID, secret key, bucket name

4. **Azure Blob Storage**
   - Microsoft's object storage
   - Best for: Azure ecosystem
   - Requires: Storage account name, key, container

#### 5. SSL/TLS Configuration

Options:
- **No SSL**: HTTP only (development/internal use)
- **Let's Encrypt**: Automatic SSL certificate (requires public domain)
- **Custom Certificate**: Provide your own SSL cert/key

**Let's Encrypt Requirements**:
- Valid public domain name
- DNS pointing to your server
- Port 80 accessible from internet
- Valid email address

#### 6. Service Deployment

The installer will:
- Generate secure secrets (64-character random strings)
- Create worklenz.env configuration file
- Download Worklenz repository
- Build Docker images (5-7 minutes)
- Start all services
- Run health checks
- Display access credentials

#### 7. Completion

Upon success, you'll receive:
- Frontend URL
- Admin email and password
- Installation directory location
- Credentials file path
- Next steps

### Installation Example

```
╔════════════════════════════════════════════════════════════╗
║                  WORKLENZ INSTALLER                        ║
║        Production-Grade Self-Hosted Deployment            ║
╚════════════════════════════════════════════════════════════╝

System Requirements Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ CPU: 4 cores (minimum: 2)
✓ RAM: 8GB (minimum: 4GB)
✓ Disk: 100GB available (minimum: 20GB)
✓ Architecture: amd64
✓ OS: Ubuntu 22.04

Docker Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Docker installed: 24.0.7
✓ Docker version is compatible

Configuration Wizard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Select Installation Mode:
  1) Express    - Quick setup with all services embedded
  2) Advanced   - Custom configuration with external services
Select mode [1]: 1

Express Mode Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Enter your domain or IP address [localhost]: worklenz.mycompany.com
Enable SSL/HTTPS [Y/n]: Y
Admin email address [admin@example.com]: admin@mycompany.com
Support/contact email [support@example.com]: support@mycompany.com
Configure email/SMTP now [Y/n]: n

Generating Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Session secret generated
✓ Cookie secret generated
✓ JWT secret generated
✓ Database password generated
✓ Redis password generated
✓ MinIO password generated
✓ Admin password generated
✓ Configuration file created

[... installation continues ...]

Installation Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
╔════════════════════════════════════════════════════════════╗
║         🎉 WORKLENZ INSTALLED SUCCESSFULLY! 🎉           ║
╚════════════════════════════════════════════════════════════╝

Access Information:
  Frontend URL:  https://worklenz.mycompany.com
  Admin Email:   admin@mycompany.com
  Admin Password: Xk2n9Pq4RtYu8Zv3

Installation Directory: /opt/worklenz

⚠ IMPORTANT:
  1. Save your credentials from: /opt/worklenz/.worklenz-credentials.txt
  2. Delete the credentials file after noting them down
  3. Ensure your domain DNS points to this server

You can now access Worklenz at: https://worklenz.mycompany.com
```

---

## Manual Installation

For users who prefer step-by-step control or are in airgapped environments.

### Step 1: Install Docker

**Ubuntu/Debian:**
```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Add Docker's GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Setup repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group (optional)
sudo usermod -aG docker $USER
```

**CentOS/RHEL:**
```bash
# Install yum-utils
sudo yum install -y yum-utils

# Add Docker repository
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Install Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker
```

### Step 2: Download Worklenz

```bash
# Create installation directory
sudo mkdir -p /opt/worklenz
cd /opt/worklenz

# Clone repository
git clone https://github.com/Worklenz/worklenz.git .

# Or download release archive
wget https://github.com/Worklenz/worklenz/archive/refs/heads/main.tar.gz
tar -xzf main.tar.gz --strip-components=1
rm main.tar.gz
```

### Step 3: Generate Configuration

```bash
cd deploy/docker/scripts
./setup-env.sh
```

This will:
- Copy worklenz.env.template
- Generate secure random secrets
- Prompt for domain and basic configuration
- Create worklenz.env in project root

### Step 4: Customize Configuration (Optional)

Edit `worklenz.env` to customize:

```bash
nano ../../../worklenz.env
```

Key settings:
- `DOMAIN`: Your domain name or IP
- `USE_SSL`: Enable HTTPS
- `STORAGE_PROVIDER`: minio, s3, or azure
- `EMAIL_ENABLED`: Enable email notifications
- See [Configuration Reference](configuration.md) for all options

### Step 5: Start Services

```bash
cd /opt/worklenz

# Start all services
docker compose -f deploy/docker/compose/docker-compose.yml --env-file worklenz.env up -d

# Check status
docker compose -f deploy/docker/compose/docker-compose.yml ps

# View logs
docker compose -f deploy/docker/compose/docker-compose.yml logs -f
```

### Step 6: Verify Installation

Wait 2-3 minutes for all services to start, then check:

```bash
# Check all services are healthy
docker compose -f deploy/docker/compose/docker-compose.yml ps

# Test backend API
curl http://localhost/api/health

# Access frontend
curl http://localhost
```

---

## Post-Installation

### First Login

1. Open your browser and navigate to your Worklenz URL
2. Use the admin credentials from installation:
   - **Email**: Value you entered during setup
   - **Password**: Auto-generated (saved in credentials file)

3. **Change your password immediately** in Settings

### Initial Setup

1. **Complete Your Profile**
   - Go to Settings → Profile
   - Update name, email, avatar

2. **Configure Organization**
   - Settings → Organization
   - Add organization name, logo

3. **Invite Team Members**
   - Team → Invite Members
   - Send invitation emails

4. **Create First Project**
   - Projects → New Project
   - Setup project structure

### Configure Email (If Skipped)

Edit `worklenz.env`:

```bash
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@yourdomain.com
```

Restart services:
```bash
cd /opt/worklenz
docker compose -f deploy/docker/compose/docker-compose.yml restart backend worker
```

### Setup SSL/TLS (If Skipped)

**Let's Encrypt:**
```bash
# Install certbot
sudo apt-get install -y certbot

# Obtain certificate
sudo certbot certonly --standalone -d your-domain.com --email your-email@example.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /opt/worklenz/deploy/docker/nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /opt/worklenz/deploy/docker/nginx/ssl/key.pem

# Update worklenz.env
USE_SSL=true
FRONTEND_URL=https://your-domain.com
```

**Restart Nginx:**
```bash
docker compose restart nginx
```

### Scheduled Backups

Add to crontab:
```bash
crontab -e
```

Add this line for daily backups at 2 AM:
```
0 2 * * * cd /opt/worklenz/deploy/docker/scripts && ./backup.sh --type full
```

---

## Configuration Modes

### Express Mode

**Features:**
- All services embedded
- Auto-configured defaults
- Minimal prompts
- Quick 5-minute setup

**Best for:**
- Development
- Testing
- Small teams (< 10 users)
- Internal deployments

**Services:**
- PostgreSQL (embedded)
- Redis (embedded)
- MinIO (embedded)
- All secrets auto-generated

### Advanced Mode

**Features:**
- Choose embedded or external services
- Custom storage backends
- SSL/TLS configuration
- Email/SMTP setup
- Granular control

**Best for:**
- Production deployments
- Medium-large teams (10+ users)
- Enterprise requirements
- Compliance needs

**Options:**
- External PostgreSQL (RDS, managed DB)
- External Redis (ElastiCache, managed)
- S3 or Azure Blob storage
- Custom SSL certificates
- Advanced networking

---

## Troubleshooting

### Installation Fails with "Insufficient Memory"

**Problem**: System has < 4GB RAM

**Solution**:
1. Upgrade server to 4GB+ RAM
2. Or add swap space:
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Docker Not Found

**Problem**: Docker not installed or not in PATH

**Solution**:
```bash
# Verify Docker
which docker

# If not found, install Docker
curl -fsSL https://get.docker.com | sh
```

### Port 80 Already in Use

**Problem**: Another service using port 80

**Solution**:
1. Find process:
```bash
sudo lsof -i :80
```

2. Stop conflicting service or use custom port:
```bash
# In worklenz.env
HTTP_PORT=8080
```

### Services Not Starting

**Problem**: Docker containers fail to start

**Solution**:
1. Check logs:
```bash
cd /opt/worklenz
docker compose -f deploy/docker/compose/docker-compose.yml logs
```

2. Check disk space:
```bash
df -h
```

3. Restart Docker:
```bash
sudo systemctl restart docker
```

### Cannot Access Frontend

**Problem**: Frontend URL returns connection refused

**Solution**:
1. Check Nginx status:
```bash
docker compose ps nginx
```

2. Check firewall:
```bash
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

3. Verify DNS:
```bash
nslookup your-domain.com
```

### Database Connection Errors

**Problem**: Backend cannot connect to database

**Solution**:
1. Check PostgreSQL logs:
```bash
docker compose logs postgres
```

2. Verify password in worklenz.env matches
3. Restart backend:
```bash
docker compose restart backend
```

---

## Next Steps

- [Architecture Overview](architecture.md)
- [Configuration Reference](configuration.md)
- [Backup & Restore](backup-restore.md)
- [Upgrade Guide](upgrade.md)
- [Troubleshooting Guide](troubleshooting.md)

## Support

- **Documentation**: `/deploy/docs/self-hosting/`
- **Issues**: [GitHub Issues](https://github.com/Worklenz/worklenz/issues)
- **Community**: [GitHub Discussions](https://github.com/Worklenz/worklenz/discussions)
