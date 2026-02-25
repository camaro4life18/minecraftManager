# PostgreSQL Migration Guide

## Overview

The Minecraft Server Manager has been migrated from SQLite to PostgreSQL for better production readiness, connection pooling, scalability, and data integrity.

## What Changed

### Dependencies
- **Removed:** `better-sqlite3` (SQLite driver)
- **Added:** `pg` (PostgreSQL client with connection pooling)

### Files Modified

#### 1. **backend/database.js** - Complete Rewrite
- Changed from synchronous SQLite operations to async/await PostgreSQL
- Implemented `pg.Pool` for connection pooling
- All database methods are now async and return promises
- Connection details read from environment variables:
  - `DB_HOST` (default: localhost)
  - `DB_PORT` (default: 5432)
  - `DB_USER` (default: minecraft_user)
  - `DB_PASSWORD` (default: minecraft_password)
  - `DB_NAME` (default: minecraft_manager)

**Key improvements:**
- Connection pooling for efficiency
- Parameterized queries to prevent SQL injection
- Proper foreign key relationships with CASCADE delete
- Indexes on frequently queried columns
- ACID transaction support

#### 2. **backend/init-db.js** - Async Update
- Changed from sync `initializeDatabase()` to `await initializeDatabase()`
- Updated user checks to use `await`
- Added proper pool connection cleanup with `pool.end()`

#### 3. **backend/server.js** - Full Async Refactor
- Wrapped Express app startup in `async startServer()` function
- Added `await` to all User, Session, and ServerCloneLog database calls
- All route handlers that touch the database are now `async`
- Better error handling during startup

#### 4. **docker-compose.yml** - PostgreSQL Service Added
```yaml
postgres:
  image: postgres:16-alpine
  environment:
    - POSTGRES_USER=minecraft_user
    - POSTGRES_PASSWORD=minecraft_password
    - POSTGRES_DB=minecraft_manager
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck: # Ensures backend waits for DB to be ready
```

Added database configuration environment variables to backend service:
- `DB_HOST=postgres` (service hostname in Docker)
- `DB_PORT=5432`
- `DB_USER`, `DB_PASSWORD`, `DB_NAME`

#### 5. **.env.example** - PostgreSQL Config Added
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=minecraft_user
DB_PASSWORD=minecraft_password
DB_NAME=minecraft_manager
```

## Database Schema

### Tables Created

**users**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
)
```

**sessions**
```sql
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
)
```

**server_clones** (audit log)
```sql
CREATE TABLE server_clones (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source_vmid INTEGER NOT NULL,
  new_vmid INTEGER NOT NULL,
  new_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending'
)
```

## How to Use

### Local Development

1. **Install PostgreSQL:**
   ```bash
   # macOS
   brew install postgresql@16
   
   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib
   
   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

2. **Create database and user:**
   ```bash
   psql -U postgres
   
   CREATE USER minecraft_user WITH PASSWORD 'minecraft_password';
   CREATE DATABASE minecraft_manager OWNER minecraft_user;
   
   # Grant privileges
   GRANT ALL PRIVILEGES ON DATABASE minecraft_manager TO minecraft_user;
   ```

3. **Copy environment file:**
   ```bash
   cp .env.example .env
   # Edit .env with your PostgreSQL credentials
   ```

4. **Install backend dependencies:**
   ```bash
   cd backend
   npm install
   ```

5. **Initialize database:**
   ```bash
   npm run init-db
   ```

   This will create tables and default users:
   - Admin: `admin` / `admin123`
   - User: `user` / `user123`

6. **Start backend:**
   ```bash
   npm run dev  # Development with hot reload
   # or
   npm start    # Production mode
   ```

### Docker Deployment

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Start all services:**
   ```bash
   docker-compose up -d
   ```

   This will:
   - Start PostgreSQL container
   - Wait for PostgreSQL to be healthy
   - Build and start backend (runs init-db automatically)
   - Build and start frontend

3. **Verify:**
   ```bash
   docker-compose logs -f backend
   # Look for: "✓ Database initialized" and "✓ Minecraft Server Manager API running"
   ```

4. **Access the app:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000/api/health

### Database Access

In Docker, to access PostgreSQL directly:
```bash
docker-compose exec postgres psql -U minecraft_user -d minecraft_manager
```

Example queries:
```sql
-- List all users
SELECT * FROM users;

-- View clone history
SELECT * FROM server_clones ORDER BY created_at DESC;

-- Check active sessions
SELECT * FROM sessions WHERE expires_at > NOW();
```

## Breaking Changes

**If you have existing SQLite data:**

The migration is not backward compatible. You'll need to:

1. **Export data from SQLite** (if needed):
   ```bash
   # Use any SQL query tool or write a migration script
   ```

2. **Recreate in PostgreSQL manually** or use a migration tool

3. **Start fresh:**
   - The `init-db` script will create new default accounts
   - All previous data will be lost

## Performance Improvements

PostgreSQL provides over SQLite:
- **Connection Pooling:** Reuses connections instead of creating new ones
- **Scalability:** Handle multiple concurrent requests efficiently  
- **ACID Transactions:** Full transaction support with rollback
- **Indexes:** Query optimization with proper indexing
- **Concurrency:** Better handling of simultaneous operations
- **Production-Ready:** Battle-tested for enterprise use

## Environment Variables

**Required for local development:**
```bash
DB_HOST=localhost          # PostgreSQL server hostname
DB_PORT=5432               # PostgreSQL port
DB_USER=minecraft_user     # PostgreSQL username
DB_PASSWORD=minecraft_pw   # PostgreSQL password
DB_NAME=minecraft_manager  # Database name
PROXMOX_HOST=...          # Your Proxmox host
PROXMOX_USERNAME=...      # Your Proxmox user
PROXMOX_PASSWORD=...      # Your Proxmox password
JWT_SECRET=...             # Secret key for JWT tokens
```

**Docker automatically provides:**
- `DB_HOST=postgres` (service name in docker-compose)
- Other variables from .env file

## Troubleshooting

### Connection refused
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
- Ensure PostgreSQL is running
- Check DB_HOST and DB_PORT are correct
- Try: `telnet localhost 5432`

### Password authentication failed
```
FATAL: password authentication failed for user "minecraft_user"
```
- Check DB_USER and DB_PASSWORD in .env
- Verify user exists in PostgreSQL
- Try connecting manually: `psql -U minecraft_user -d minecraft_manager`

### Database does not exist
```
FATAL: database "minecraft_manager" does not exist
```
- Run `npm run init-db` to create tables
- Or manually create with PostgreSQL client

### Port already in use
```
Error: listen EADDRINUSE: address already in use :::5432
```
- Change DB_PORT in .env
- Or kill process using port: `lsof -i :5432`

## Rollback (back to SQLite)

If you need to go back to SQLite:

1. `git checkout backend/database.js backend/init-db.js backend/server.js`
2. `npm install --save better-sqlite3`
3. `npm uninstall pg`
4. Restore SQLite database backup if available

## Next Steps

- Update production deployment scripts to use PostgreSQL
- Set strong credentials in `.env` for production
- Configure PostgreSQL backups
- Monitor database performance
- Consider adding connection pool monitoring

## Support

For PostgreSQL documentation: https://www.postgresql.org/docs/
For node-pg documentation: https://node-postgres.com/