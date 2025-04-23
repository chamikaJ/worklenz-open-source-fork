# Database Migrations

This directory contains SQL migration files that are automatically applied to the database when the application starts.

## How Migrations Work

1. Each migration file should be named with a timestamp prefix to ensure migrations are applied in the correct order.
   Format: `YYYYMMDDHHMMSS-description.sql`
   Example: `20250422143015-create-users-table.sql`

2. The migration system tracks which migrations have been applied in the `db_migrations` table.

3. When the application starts, it checks which migrations have been applied and runs any new migrations.

## Creating a New Migration

1. Use the provided script to create a new migration with the current timestamp:
   ```bash
   # Navigate to the backend directory
   cd worklenz-backend
   
   # Create a new migration
   ./scripts/create-migration.sh add-user-settings
   ```
   
   This will create a file with format: `YYYYMMDDHHMMSS-description.sql`
   Example: `20250422143015-add-user-settings.sql`

2. Add SQL statements to the file that perform the necessary database changes.

3. Include comments at the top of the file explaining what the migration does, and always include today's date:
   ```sql
   -- Migration: Add user preferences table
   -- Date: YYYY-MM-DD (today's date)
   -- Version: 1.0.0
   ```

4. For schema changes, always use `IF EXISTS` and `IF NOT EXISTS` clauses to make migrations idempotent.

## Migration Best Practices

1. **Idempotent Migrations**: Make sure your migrations can be run multiple times without causing errors.

2. **Backward Compatibility**: Avoid breaking changes if possible. If not, document them clearly.

3. **Transaction Safety**: Wrap complex migrations in transactions to ensure atomicity.

4. **Test Before Deploying**: Always test migrations on a development database before deploying to production.

5. **Comments**: Add descriptive comments to complex SQL statements.

## Example Migration

```sql
-- Migration: Add user preferences table
-- Timestamp: 2023-05-01
-- Description: Creates a table to store user preferences

BEGIN;

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(50) NOT NULL DEFAULT 'light',
    notifications BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
);

COMMIT;
```

## Manual Progress Migration

The manual task progress migration (`migration-manual-task-progress.sql`) adds the ability to manually set progress on tasks instead of relying solely on the automatic calculation based on subtasks.

This migration:
1. Adds two new columns to the `tasks` table: `manual_progress` (boolean) and `progress_value` (integer)
2. Updates the `get_task_complete_ratio` function to use the manual progress value when set 