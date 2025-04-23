#!/bin/bash
set -e

# Check if a description was provided
if [ -z "$1" ]; then
  echo "Error: No migration description provided"
  echo "Usage: ./create-migration.sh <description>"
  echo "Example: ./create-migration.sh add-user-settings"
  exit 1
fi

# Format the description to be kebab-case
DESCRIPTION=$(echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

# Get current date and time in YYYYMMDDHHMMSS format for uniqueness
TIMESTAMP=$(date +%Y%m%d%H%M%S)
FORMATTED_DATE=$(date +%Y-%m-%d)

# Create filename
FILENAME="${TIMESTAMP}-${DESCRIPTION}.sql"

# Target directory
TARGET_DIR="database/sql/migrations"
mkdir -p $TARGET_DIR

# Create the migration file
cat > "$TARGET_DIR/$FILENAME" << EOL
-- Migration: ${DESCRIPTION//-/ }
-- Date: ${FORMATTED_DATE}
-- Version: 1.0.0

BEGIN;

-- Your SQL statements here

COMMIT;
EOL

echo "Created migration file: $TARGET_DIR/$FILENAME"
echo "Don't forget to add your SQL statements to the file!"

# Make the migration script executable
chmod +x scripts/create-migration.sh 