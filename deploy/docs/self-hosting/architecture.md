# Worklenz Self-Hosted Architecture

Comprehensive overview of Worklenz's self-hosted deployment architecture, services, and infrastructure.

## Table of Contents

- [Overview](#overview)
- [Service Architecture](#service-architecture)
- [Network Topology](#network-topology)
- [Data Flow](#data-flow)
- [Storage Architecture](#storage-architecture)
- [Security Architecture](#security-architecture)
- [Scaling Architecture](#scaling-architecture)

---

## Overview

Worklenz self-hosted deployment uses a microservices-based architecture running in Docker containers, orchestrated by Docker Compose. All services run in an isolated internal network, with only Nginx exposed to the host.

### Core Components

| Component | Purpose | Technology | Port |
|-----------|---------|------------|------|
| **Nginx** | Reverse proxy, SSL termination, load balancing | Nginx Alpine | 80, 443 |
| **Frontend** | React single-page application | Node 22, React 18, Vite | 5000 (internal) |
| **Backend API** | REST API, business logic | Node 20, Express.js, TypeScript | 3000 (internal) |
| **Worker** | Background jobs, cron tasks | Node 20, Express.js, BullMQ | N/A |
| **PostgreSQL** | Primary database | PostgreSQL 15 Alpine | 5432 (internal) |
| **Redis** | Cache, sessions, Socket.IO adapter | Redis 7 Alpine | 6379 (internal) |
| **MinIO** | Object storage (S3-compatible) | MinIO Latest | 9000, 9001 (internal) |

---

## Service Architecture

### Frontend (React Application)

**Purpose**: User interface

**Technology Stack**:
- React 18 with TypeScript
- Redux Toolkit for state management
- Ant Design UI framework
- Socket.IO client for real-time updates
- Vite for build tooling

**Container Details**:
- **Base Image**: node:22-alpine
- **Build**: Multi-stage (dependencies → builder → production)
- **Serving**: serve package (static file server)
- **Runtime Config**: Environment variables injected at startup via env-config.sh
- **Health Check**: HTTP GET on port 5000

**Key Features**:
- **Client-side routing** with React Router
- **Real-time updates** via Socket.IO
- **Responsive design** (mobile, tablet, desktop)
- **Lazy loading** for performance
- **PWA capabilities** (future)

### Backend API (Express Server)

**Purpose**: REST API, business logic, WebSocket server

**Technology Stack**:
- Express.js with TypeScript
- PostgreSQL with node-postgres
- Socket.IO for real-time features
- Passport.js for authentication
- Bull/BullMQ for job queues

**Container Details**:
- **Base Image**: node:20-alpine
- **Build**: Multi-stage with TypeScript compilation
- **Entry Point**: build/bin/www.js
- **Health Check**: GET /health endpoint
- **Security**: Non-root user (worklenz:1001)

**API Structure**:
```
/api/v1/
├── auth/           # Authentication endpoints
├── projects/       # Project management
├── tasks/          # Task CRUD
├── teams/          # Team management
├── users/          # User management
├── files/          # File uploads
├── reports/        # Analytics & reporting
└── webhooks/       # External integrations
```

**Key Responsibilities**:
- Request handling and routing
- Business logic execution
- Database operations
- Authentication & authorization
- Session management (Redis)
- WebSocket server (Socket.IO)
- File upload handling

### Worker (Background Processor)

**Purpose**: Asynchronous job processing, scheduled tasks

**Technology Stack**:
- Same codebase as Backend
- Bull/BullMQ for job queues
- node-cron for scheduled tasks
- Dedicated entry point

**Container Details**:
- **Base Image**: node:20-alpine
- **Entry Point**: build/bin/www.js with WORKER_MODE=true
- **No HTTP Server**: Only processes jobs
- **Scalable**: Can run 0-N instances

**Job Types**:
1. **Scheduled Jobs** (Cron):
   - Daily email digests
   - Weekly reports
   - Data cleanup
   - Analytics aggregation
   - Recurring task automation

2. **Background Jobs** (Queue):
   - Email sending (transactional, bulk)
   - File exports (Excel, PDF, CSV)
   - Image processing/resizing
   - Webhook delivery
   - Long-running operations

**Health Check**: Process existence check

### PostgreSQL Database

**Purpose**: Primary data store

**Schema Overview**:
- **Projects**: Core project data, settings, members
- **Tasks**: Task details, dependencies, time tracking
- **Users**: User accounts, authentication
- **Teams**: Organization structure, roles, permissions
- **Custom Fields**: Extensible metadata
- **Activity Logs**: Audit trail
- **File Metadata**: File references (actual files in MinIO/S3)

**Container Details**:
- **Base Image**: postgres:15-alpine
- **Data Volume**: worklenz_postgres_data (persistent)
- **Initialization**: SQL scripts in database/ directory
- **Health Check**: pg_isready command
- **Backup**: pg_dump via backup.sh script

**Connection Pooling**:
- Max connections: 50 (configurable)
- Backend uses connection pool
- Worker has separate connection pool

### Redis Cache

**Purpose**: Session store, cache, Socket.IO adapter

**Use Cases**:
1. **Session Storage**: Express session store
2. **Socket.IO Adapter**: Multi-instance message broker
3. **Application Cache**: API response caching
4. **Job Queue**: Bull/BullMQ queue storage
5. **Rate Limiting**: Request tracking

**Container Details**:
- **Base Image**: redis:7-alpine
- **Persistence**: AOF (Append-Only File) enabled
- **Data Volume**: worklenz_redis_data
- **Authentication**: Password protected
- **Eviction Policy**: allkeys-lru
- **Max Memory**: 256MB (configurable)

**Configuration**:
```
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
requirepass <auto-generated>
```

### MinIO Object Storage

**Purpose**: File storage (S3-compatible)

**Storage Types**:
- User avatars
- Project files
- Task attachments
- Exported reports
- Image uploads

**Container Details**:
- **Base Image**: minio/minio:latest
- **Data Volume**: worklenz_minio_data
- **API Port**: 9000 (internal)
- **Console Port**: 9001 (internal)
- **Health Check**: /minio/health/live endpoint

**Bucket Structure**:
```
worklenz-bucket/
├── avatars/
├── projects/
│   └── {project-id}/
│       ├── files/
│       └── attachments/
├── tasks/
│   └── {task-id}/
│       └── attachments/
└── exports/
    └── reports/
```

**Setup Process**:
1. MinIO container starts
2. minio_setup container waits for health
3. Creates default bucket (worklenz-bucket)
4. Sets public read policy (optional)
5. Exits after setup

**Alternatives**:
- AWS S3 (set STORAGE_PROVIDER=s3)
- Azure Blob Storage (set STORAGE_PROVIDER=azure)
- Any S3-compatible service

### Nginx Reverse Proxy

**Purpose**: Ingress, SSL termination, load balancing

**Configuration**:
- **Upstream Definitions**: backend:3000, frontend:5000
- **HTTP Server**: Port 80
- **HTTPS Server**: Port 443 (optional, requires SSL certs)
- **WebSocket Support**: Proxy for Socket.IO
- **Rate Limiting**: 10 req/sec API, 5 req/min login
- **Compression**: Gzip enabled for text/json
- **Security Headers**: HSTS, X-Frame-Options, CSP
- **Static Caching**: 1 year for immutable assets

**Routes**:
```
/                   → frontend:5000 (SPA)
/api/*              → backend:3000 (API)
/socket.io/*        → backend:3000 (WebSocket)
/health             → 200 OK (nginx health)
```

**SSL/TLS**:
- Certificates in: deploy/docker/nginx/ssl/
- Supports: Let's Encrypt, custom certificates
- Protocols: TLS 1.2, TLS 1.3
- Strong cipher suites

---

## Network Topology

### Network Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                            │
└───────────────────────────┬─────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │   Firewall     │
                    │  (Host Ports)  │
                    │  80, 443       │
                    └───────┬────────┘
                            │
          ┌─────────────────▼──────────────────┐
          │        Docker Network              │
          │     (worklenz_internal)            │
          │                                    │
          │  ┌────────────────────────────┐   │
          │  │   Nginx (reverse proxy)    │◄──┼─── Port 80:80
          │  │   Alpine                   │◄──┼─── Port 443:443
          │  └──┬─────────────────────┬───┘   │
          │     │                     │       │
          │  ┌──▼──────┐       ┌─────▼────┐  │
          │  │Frontend │       │ Backend  │  │
          │  │React:5000│      │Express:3000│ │
          │  └─────────┘       └──┬───┬───┘  │
          │                       │   │      │
          │     ┌─────────────────┘   │      │
          │     │  ┌──────────────────┘      │
          │  ┌──▼──▼─────┐  ┌────────────┐  │
          │  │  Worker    │  │  Redis     │  │
          │  │ Background │  │  Cache     │  │
          │  │  Jobs      │  │  :6379     │  │
          │  └──┬─────────┘  └────────────┘  │
          │     │                             │
          │  ┌──▼──────────┐  ┌────────────┐ │
          │  │ PostgreSQL  │  │   MinIO    │ │
          │  │ Database    │  │  Storage   │ │
          │  │  :5432      │  │  :9000     │ │
          │  └─────────────┘  └────────────┘ │
          │                                    │
          └────────────────────────────────────┘

┌──────────────────────────────────────────┐
│         Docker Volumes (Persistent)      │
│                                          │
│  • worklenz_postgres_data                │
│  • worklenz_redis_data                   │
│  • worklenz_minio_data                   │
└──────────────────────────────────────────┘
```

### Network Details

**Bridge Network**: `worklenz_internal`
- **Driver**: bridge
- **Isolation**: Services cannot access host network
- **DNS**: Automatic service discovery by container name
- **Security**: Only Nginx exposed to host

**Service Communication**:
- All services communicate via internal Docker network
- Use container names as hostnames (e.g., `postgres`, `redis`)
- No ports exposed to host except Nginx (80, 443)

**External Access**:
- **Clients** → Nginx (80/443) → Frontend/Backend
- **No direct access** to database, cache, or storage from outside

---

## Data Flow

### Request Flow (Page Load)

```
1. Browser
   ↓ HTTPS GET /
2. Nginx (443)
   ↓ Proxy to frontend:5000
3. Frontend Container
   ↓ Serve index.html + static assets
4. Browser
   ↓ Parse HTML, load JS/CSS
5. React App Initializes
   ↓ API call: GET /api/v1/auth/profile
6. Nginx
   ↓ Proxy to backend:3000/api/v1/auth/profile
7. Backend API
   ↓ Verify session (check Redis)
8. Redis
   ↓ Return session data
9. Backend
   ↓ Query database
10. PostgreSQL
    ↓ Return user data
11. Backend
    ↓ Format response JSON
12. Nginx → Browser
    ↓ Display user dashboard
```

### Real-Time Update Flow (WebSocket)

```
1. Browser
   ↓ Socket.IO connection to /socket.io/
2. Nginx
   ↓ Upgrade to WebSocket, proxy to backend:3000
3. Backend (Socket.IO server)
   ↓ Authenticate user, subscribe to rooms
4. Redis (Socket.IO adapter)
   ↓ Store connection state

[When task is updated by User A]

5. Backend API (POST /api/v1/tasks/:id)
   ↓ Update database
6. PostgreSQL
   ↓ Save changes
7. Backend
   ↓ Emit Socket.IO event "task:updated"
8. Redis (Socket.IO adapter)
   ↓ Broadcast to all connected clients in room
9. Backend → All Clients
   ↓ Push event via WebSocket
10. Browser (User B, User C, etc.)
    ↓ Receive event, update UI in real-time
```

### File Upload Flow

```
1. Browser
   ↓ POST /api/v1/files/upload (multipart/form-data)
2. Nginx
   ↓ Proxy to backend:3000 (no buffering)
3. Backend API
   ↓ Receive file stream
4. Backend
   ↓ PUT to MinIO (or S3)
5. MinIO/S3
   ↓ Store file, return URL
6. Backend
   ↓ Save metadata to database
7. PostgreSQL
   ↓ Store file reference (URL, size, type)
8. Backend
   ↓ Return success + file URL
9. Browser
   ↓ Display uploaded file
```

### Background Job Flow

```
1. Backend API
   ↓ Add job to queue: sendEmail({...})
2. Bull (Redis)
   ↓ Enqueue job
3. Worker Container(s)
   ↓ Poll Redis for jobs
4. Worker picks job
   ↓ Execute: Send email via SMTP
5. SMTP Server (external)
   ↓ Deliver email
6. Worker
   ↓ Mark job complete in Redis
7. Backend (if needed)
   ↓ Update database with status
```

---

## Storage Architecture

### Data Persistence

**PostgreSQL Data**:
- **Volume**: `worklenz_postgres_data`
- **Mount**: /var/lib/postgresql/data
- **Backup**: pg_dump daily
- **Size**: Grows with data (typically 100MB-10GB)

**Redis Data**:
- **Volume**: `worklenz_redis_data`
- **Mount**: /data
- **Persistence**: AOF (Append-Only File)
- **Backup**: RDB snapshot (optional)
- **Size**: Typically < 1GB

**MinIO Data** (if embedded):
- **Volume**: `worklenz_minio_data`
- **Mount**: /data
- **Backup**: Volume export or mc mirror
- **Size**: Grows with uploads (10GB-1TB+)

**Configuration Files**:
- **Location**: /opt/worklenz/worklenz.env
- **Backup**: Included in backup.sh
- **Sensitive**: Contains secrets, passwords

### Storage Options Comparison

| Feature | Embedded MinIO | External S3 | Azure Blob |
|---------|----------------|-------------|------------|
| **Setup** | Automatic | Manual config | Manual config |
| **Cost** | Server disk only | Pay per GB | Pay per GB |
| **Scalability** | Limited by disk | Unlimited | Unlimited |
| **Reliability** | Single node | 99.99% SLA | 99.9% SLA |
| **Backup** | Manual | Automatic | Automatic |
| **Best For** | < 50GB | > 100GB | Azure ecosystem |

---

## Security Architecture

### Network Security

**Isolation**:
- All services in internal network
- Only Nginx exposed (80, 443)
- No direct database/cache access

**Firewall**:
```bash
# Recommended UFW rules
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw deny from any to any  # Deny all other
sudo ufw enable
```

### Application Security

**Authentication**:
- Session-based (express-session + Redis)
- JWT tokens for API
- Password hashing (bcrypt)
- Google OAuth (optional)

**Authorization**:
- Role-based access control (RBAC)
- Project-level permissions
- Team hierarchies

**CSRF Protection**:
- csrf-sync middleware
- Token validation on mutations

**Input Validation**:
- Server-side validation
- Sanitization (sanitize-html)
- SQL injection prevention (parameterized queries)

**Security Headers** (Nginx):
```
Strict-Transport-Security: max-age=31536000
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Content-Security-Policy: ...
```

### Container Security

**Non-Root Users**:
- All containers run as non-root (UID 1001)
- Minimal privileges

**Image Security**:
- Alpine-based images (minimal attack surface)
- Regular security updates
- No unnecessary packages

**Secrets Management**:
- Generated secrets (64-character random)
- Stored in worklenz.env (not in Git)
- Environment variable injection

---

## Scaling Architecture

### Vertical Scaling

**Increase Resources**:
```yaml
# docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 4G
```

**Database Tuning**:
- Increase max_connections
- Tune shared_buffers
- Enable query caching

**Redis Tuning**:
- Increase max memory
- Adjust eviction policy

### Horizontal Scaling (Future)

**Multiple Backend Instances**:
```yaml
services:
  backend:
    deploy:
      replicas: 3
```

**Requirements**:
- Redis for session storage (already configured)
- Redis Socket.IO adapter (already configured)
- Nginx load balancing (update upstream)

**Multiple Worker Instances**:
- Already supported
- Scale independently: `docker compose up -d --scale worker=3`

**Database Read Replicas**:
- PostgreSQL streaming replication
- Separate read/write connections
- Load balance read queries

---

## Next Steps

- [Installation Guide](installation.md)
- [Configuration Reference](configuration.md)
- [Backup & Restore](backup-restore.md)
- [Troubleshooting](troubleshooting.md)
