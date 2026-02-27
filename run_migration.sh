#!/bin/bash
# Run database migrations for progress tracking

echo "Running database migration to add progress_percent column..."

# Get database credentials from .env or use defaults
source .env 2>/dev/null || true
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5433}
DB_USER=${DB_USER:-minecraft_user}
DB_NAME=${DB_NAME:-minecraft_manager}

# Run the migration
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f backend/migrations/add_progress_percent.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully!"
else
    echo "❌ Migration failed!"
    exit 1
fi
