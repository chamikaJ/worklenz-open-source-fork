# Worklenz Self-Hosting Documentation

Comprehensive documentation for deploying and managing Worklenz on your own infrastructure.

## Documentation Index

### 🚀 Getting Started

- **[Installation Guide](installation.md)** - Complete installation instructions
  - One-command installation
  - Manual installation steps
  - System requirements
  - Post-installation configuration

### 🏗️ Architecture & Design

- **[Architecture Overview](architecture.md)** - System architecture and design
  - Service architecture
  - Network topology
  - Data flow diagrams
  - Security architecture
  - Scaling strategies

### 📚 Configuration & Management

- **[Configuration Reference](configuration.md)** *(Coming Soon)*
  - Environment variables reference
  - Service configuration
  - Advanced settings
  - Performance tuning

- **[Storage Backends](storage-backends.md)** *(Coming Soon)*
  - MinIO (embedded)
  - AWS S3
  - Azure Blob Storage
  - Migration between providers

### 🔧 Operations

- **[Backup & Restore](backup-restore.md)** *(Coming Soon)*
  - Backup strategies
  - Automated backups
  - Restoration procedures
  - Disaster recovery

- **[Upgrade Guide](upgrade.md)** *(Coming Soon)*
  - Upgrade procedures
  - Version compatibility
  - Breaking changes
  - Rollback procedures

- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions
  - Installation issues
  - Service problems
  - Database issues
  - Storage issues
  - Network problems
  - Performance troubleshooting

### 🔒 Security

- **[Security Guide](security.md)** *(Coming Soon)*
  - Security best practices
  - SSL/TLS setup
  - Firewall configuration
  - Secret management
  - Hardening checklist

---

## Quick Links

### Management Scripts

All management scripts are located in `deploy/docker/scripts/`:

| Script | Purpose |
|--------|---------|
| **install.sh** | One-command installer |
| **status.sh** | Health monitoring dashboard |
| **backup.sh** | Create backups |
| **restore.sh** | Restore from backup |
| **upgrade.sh** | Upgrade to new version |
| **logs.sh** | View service logs |
| **restart.sh** | Restart services |
| **stop.sh** | Stop services |

### Common Commands

```bash
# Check system status
cd /opt/worklenz/deploy/docker/scripts
./status.sh

# View logs
./logs.sh backend --follow

# Create backup
./backup.sh --type full

# Restart service
./restart.sh backend

# Upgrade to latest
./upgrade.sh
```

---

## Installation Quick Start

**One-command installation:**
```bash
curl -fsSL https://raw.githubusercontent.com/Worklenz/worklenz/main/deploy/docker/scripts/install.sh | bash
```

**Manual installation:**
```bash
git clone https://github.com/Worklenz/worklenz.git /opt/worklenz
cd /opt/worklenz/deploy/docker/scripts
./setup-env.sh
cd /opt/worklenz
docker compose -f deploy/docker/compose/docker-compose.yml up -d
```

See [Installation Guide](installation.md) for detailed instructions.

---

## System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 4GB
- Disk: 20GB
- OS: Linux (Ubuntu 20.04+, Debian 11+)
- Docker: 20.10+
- Docker Compose: 2.0+

**Recommended:**
- CPU: 4+ cores
- RAM: 8GB+
- Disk: 50GB+ SSD
- OS: Ubuntu 22.04 LTS

---

## Architecture Overview

```
Internet → Nginx (80/443) → Frontend (React)
                          ↓
                    Backend (Express) ← Socket.IO
                          ↓
            ┌──────────┬──┴──┬────────────┐
            ↓          ↓     ↓            ↓
       PostgreSQL   Redis  Worker    MinIO/S3
```

See [Architecture](architecture.md) for detailed diagrams and explanations.

---

## Support

### Documentation
- Installation, configuration, and troubleshooting guides in this directory
- Inline help in scripts: `./script.sh --help`

### Community
- **Issues**: [GitHub Issues](https://github.com/Worklenz/worklenz/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Worklenz/worklenz/discussions)

### Before Asking for Help
1. Check [Troubleshooting Guide](troubleshooting.md)
2. Review relevant documentation
3. Check logs: `./logs.sh --since 1h`
4. Collect system info: `./status.sh --json`

---

## Contributing

We welcome contributions to documentation! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for details.

---

## License

Worklenz is licensed under AGPL-3.0. See [LICENSE](../../../LICENSE) for details.

---

## Version

- **Documentation Version**: 1.0
- **Last Updated**: 2025-01-15
- **Compatible with**: Worklenz 1.5.0+
