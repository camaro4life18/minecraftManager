#!/bin/bash
# Backend startup script
# Initializes PostgreSQL database and starts the server

set -e

echo "🚀 Starting Minecraft Server Manager Backend..."
echo ""

# Wait for PostgreSQL to be available
if [ ! -z "$DB_HOST" ]; then
  echo "⏳ Waiting for PostgreSQL at $DB_HOST:$DB_PORT..."
  
  RETRY_COUNT=0
  MAX_RETRIES=30
  
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if nc -z "$DB_HOST" "${DB_PORT:-5432}" 2>/dev/null; then
      echo "✓ PostgreSQL is available"
      break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Attempt $RETRY_COUNT/$MAX_RETRIES - PostgreSQL not ready yet..."
    sleep 1
  done
  
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "✗ PostgreSQL did not become available in time"
    exit 1
  fi
fi

echo ""
echo "📦 Initializing PostgreSQL database..."
npm run init-db
echo ""

# Start the server
echo "🎮 Starting Express server..."
npm start