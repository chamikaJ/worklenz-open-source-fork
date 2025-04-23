#!/bin/bash
set -e

echo "Running database migrations..."

# Get environment variables
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-worklenz_db}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-password}

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c '\q' 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "PostgreSQL is up - executing migrations"

# Create migrations table if it doesn't exist
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
CREATE TABLE IF NOT EXISTS db_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);"

# Get list of applied migrations
APPLIED_MIGRATIONS=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT filename FROM db_migrations ORDER BY filename;")

# Run migrations in order
MIGRATION_DIR="/app/database/sql/migrations"
cd $MIGRATION_DIR

for migration_file in $(ls -1 | sort); do
  if ! echo "$APPLIED_MIGRATIONS" | grep -q "$migration_file"; then
    echo "Applying migration: $migration_file"
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f "$migration_file"
    
    # Mark migration as applied
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
    INSERT INTO db_migrations (filename) VALUES ('$migration_file');"
    
    echo "Migration $migration_file applied successfully"
  else
    echo "Migration $migration_file already applied, skipping"
  fi
done

echo "All migrations completed successfully!"
exit 0 