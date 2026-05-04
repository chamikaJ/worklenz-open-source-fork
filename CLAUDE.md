# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

Monorepo with three independently runnable apps:

- **`worklenz-backend/`** — Express + TypeScript + PostgreSQL API server (port 3000)
- **`worklenz-frontend/`** — Main admin/team React app (port 5173)
- **`worklenz-client-portal/`** — Standalone client-facing React app (port 5174)

## Commands

### Backend (`worklenz-backend/`)
```bash
npm run dev          # Compile TypeScript then watch (initial compile takes ~10s)
npm run build        # Production build
npm start            # Run production build
npm test             # Jest tests
npm run migrate:up   # Run pending DB migrations
npm run migrate:down # Rollback last migration
npm run migrate:create -- <name>  # Create a new migration file
```

### Frontend (`worklenz-frontend/`)
```bash
npm run dev          # Vite dev server (proxies /api/* to backend:3000)
npm run build        # Production build to build/
npm test             # Vitest (watch mode)
npm run test:run     # Vitest single run (CI-style)
npm run test:coverage
```

### Client Portal (`worklenz-client-portal/`)
```bash
npm run dev          # Vite dev server (port 5174)
npm run build        # tsc + vite build to dist/
npm run lint         # ESLint
```

## Backend Architecture

### Controllers
Two controller patterns coexist:

1. **Main controllers** — extend `WorklenzControllerBase`, use `@HandleExceptions()` decorator which catches async errors and returns formatted `ServerResponse`:
   ```typescript
   export default class TasksController extends WorklenzControllerBase {
     @HandleExceptions()
     public static async create(req: IWorkLenzRequest, res: IWorkLenzResponse) { ... }
   }
   ```

2. **Client portal controllers** — plain static methods wrapped in `safeControllerFunction()` on the router (no decorator), extend `ClientPortalControllerBase`:
   ```typescript
   router.get("/profile", safeControllerFunction(ClientPortalProfileController.getClientProfile));
   ```

### Response Pattern
All responses use `new ServerResponse(done, body, message)`. The `done` boolean drives frontend success/error handling.

### Database
- `db.query(sql, [params])` for single queries
- `db.pool.connect()` → `BEGIN`/`COMMIT`/`ROLLBACK` → `client.release()` in `finally` for transactions
- DATE columns (OID 1082) return plain `'YYYY-MM-DD'` strings, not JS Date objects (type parser override in `src/config/db.ts`)

### Route Middleware Chain
```
validatorMiddleware → accessControlMiddleware → mapperMiddleware → safeControllerFunction(Controller.method)
```
Validators live in `src/middlewares/validators/`. Access control uses `verifyProjectAccess`, `verifyTaskAccess`, etc.

### Client Portal Dual-Route Pattern
The same business logic is accessible from two entry points:
- **Admin route** `clients-api-router.ts` → `clients-controller.ts` (wraps portal controller methods, admin auth)
- **Client route** `client-portal-api-router.ts` → portal controllers directly (token auth via `client-auth-middleware.ts`)

Key paths:
- Portal controllers: `src/controllers/client-portal/`
- Admin wrapper: `src/controllers/clients-controller.ts`
- `TokenService` (`src/services/token-service.ts`): use `verifyClientPassword()` (bcrypt + SHA256 fallback) and `hashClientPassword()` (bcrypt) — never raw SHA256 for client passwords

### Socket.io
Real-time events in `src/socket.io/index.ts`. Separate namespace for client portal chat (`on-chat-*` events). Singleton access via `src/shared/io.ts`.

### Database Migrations
Managed by **node-pg-migrate**. Files live in `database/pg-migrations/`, named `<unix-timestamp>_<description>.js`.

```bash
npm run migrate:up                        # Run pending migrations
npm run migrate:down                      # Rollback last migration
npm run migrate:create -- <description>   # Scaffold a new file
```

Each file exports `up` and `down` using the `pgm` builder. Raw SQL is fine via `pgm.sql(...)`:

```javascript
/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS my_table (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_my_table_id ON my_table(id);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS my_table;`);
};
```

Rules: always use `IF EXISTS`/`IF NOT EXISTS`; include a `down`; one logical change per file. Migration history is tracked in the `pgmigrations` table — do not modify it manually.

## Frontend Architecture (`worklenz-frontend`)

### State Management
Hybrid Redux Toolkit + RTK Query:
- **97 Redux slices** in `src/features/` organized by domain
- **8 RTK Query services** in `src/api/` (projects, clientPortal, homePage, roadmap, schedule, workload, personalOverview, userActivity)
- Store configured in `src/app/store.ts`

### API Layer
- Custom Axios client at `src/api/api-client.ts`: handles CSRF token initialization, refresh on expiry, 401 redirects, and alert integration
- All state-changing requests require `X-CSRF-Token` header (injected automatically)
- RTK Query services use `fetchBaseQuery` with the custom Axios underneath

### Routing
React Router v6, entry at `src/app/routes/index.tsx`, split into feature files:
`auth-routes.tsx`, `main-routes.tsx`, `client-portal-routes.tsx`, `admin-center-routes.tsx`, etc.

### Path Aliases (Vite)
`@` → `src`, `@components`, `@features`, `@api`, `@pages`, `@hooks`, `@utils`, `@types`, `@shared`, `@layouts`, `@services`, `@assets`

### Internationalization
- i18next with HTTP backend loading from `public/locales/{lng}/{ns}.json`
- Supported languages: `en`, `de`, `es`, `pt`, `zh`, `alb`
- Namespace per feature (e.g., `client-portal-clients`, `project-drawer`); `common` is default
- Current language stored in Redux `features/i18n/localesSlice`
- **Every `t()` call must include a `defaultValue`**: `t('taskNameColumn', { defaultValue: 'Task' })`

## Client Portal App (`worklenz-client-portal`)

Minimal Redux setup: 2 slices (`authSlice`, `uiSlice`) + 1 RTK Query service (`src/store/api.ts`, 26 endpoints).

Auth uses `x-client-token` header (stored in `localStorage`) instead of CSRF sessions.

Vite alias: `@` → `src` only.

## API Route & Auth Reference

| Frontend App | Base URL | Auth Method | Example Path |
|---|---|---|---|
| Main admin app | `/api/v1` | Session + CSRF token | `/api/v1/projects` |
| Admin managing client portal | `/api/v1` | Session + CSRF token | `/api/v1/clients/portal/invoices` |
| Client portal app | `/api/client-portal` | `x-client-token` header | `/api/client-portal/dashboard` |

Client portal routes are **excluded from CSRF protection** — they use `x-client-token` instead. Main `/api/v1/*` routes require the `X-CSRF-Token` header on all state-changing requests (POST/PUT/DELETE/PATCH).

## Code Conventions

### TypeScript
- Avoid `any` — use strict typing throughout
- Prefer `interface` over `type` for object shapes
- Use auxiliary verb naming: `isLoading`, `hasError`, `canEdit`

### React Components
- Use **named exports** (not default exports) with explicit `React.FC<Props>` typing:
  ```typescript
  // ✅ Correct
  export const TaskCard: React.FC<TaskCardProps> = ({ task, onUpdate }) => { ... };

  // ❌ Avoid
  export default (props: any) => { ... };
  ```
- File layout order: main export → subcomponents → helper functions → static constants → interfaces/types

### Theme
All UI must support both dark and light themes — test components in both. Use Ant Design theme tokens; do not hardcode colors.
