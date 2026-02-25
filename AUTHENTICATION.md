# Authentication & User Management Guide

Your Minecraft Server Manager now includes a complete authentication and authorization system with role-based access control.

## Features

✅ **User Login** - Secure authentication with JWT tokens  
✅ **Role-Based Access** - Admin and User roles with different permissions  
✅ **Secure Passwords** - Bcrypt password hashing  
✅ **Session Management** - Automatic token expiration (7 days)  
✅ **Admin Panel** - Create and manage users  
✅ **Audit Trail** - Track who cloned which servers  

---

## User Roles & Permissions

### Admin Role (You)
Admins can:
- ✅ View all servers
- ✅ Clone servers
- ✅ Start/Stop servers
- ✅ **Delete servers**
- ✅ Manage users (create, delete, change roles)
- ✅ View audit logs

### User Role (Your Son)
Users can:
- ✅ View all servers
- ✅ Clone servers
- ✅ Start/Stop servers
- ❌ Delete servers
- ❌ Manage users

---

## Getting Started

### 1. First Time Setup - Initialize Database

After first deployment, initialize the database with default users:

**Local Development:**
```bash
cd backend
npm install
npm run init-db
```

**Docker:**
```bash
docker-compose exec backend npm run init-db
```

This creates:
- Admin user: `admin` / `admin123`
- Demo user: `user` / `user123`

### 2. Log In

1. Open http://localhost:3000
2. Enter credentials:
   - **Admin**: admin / admin123
   - **User**: user / user123
3. Click Login

✅ You're in!

---

## First Time Actions

### Change Admin Password

⚠️ **IMPORTANT**: Change the default admin password immediately!

1. Log in as admin
2. Currently: No password change UI (recommended for production setup)
3. SSH to backend: `docker exec -it minecraft-manager-backend bash`
4. Create new admin user through API:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newadmin",
    "email": "you@example.com",
    "password": "secure-password-123",
    "role": "admin"
  }'
```

### Create User Account for Your Son

As admin, create a user account for your son:

**Via API:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "son-username",
    "email": "son@example.com",
    "password": "secure-password",
    "role": "user"
  }'
```

Response:
```json
{
  "success": true,
  "user": {
    "id": 2,
    "username": "son-username",
    "email": "son@example.com",
    "role": "user"
  }
}
```

---

## User Management API (Admin Only)

### Get All Users
```bash
GET /api/users
Authorization: Bearer ADMIN_TOKEN
```

Response:
```json
[
  {
    "id": 1,
    "username": "admin",
    "email": "admin@localhost",
    "role": "admin",
    "created_at": "2026-02-24T10:00:00Z",
    "last_login": "2026-02-24T10:05:00Z"
  },
  {
    "id": 2,
    "username": "user",
    "email": "user@localhost",
    "role": "user",
    "created_at": "2026-02-24T10:01:00Z",
    "last_login": null
  }
]
```

### Update User Role
```bash
PATCH /api/users/{userId}/role
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{
  "role": "admin"
}
```

### Delete User
```bash
DELETE /api/users/{userId}
Authorization: Bearer ADMIN_TOKEN
```

---

## Server Management with Auth

All server management endpoints now require a valid JWT token.

### Clone Server (Users & Admins)
```bash
POST /api/servers/clone
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "sourceVmId": 100,
  "newVmName": "minecraft-server-3",
  "newVmId": 103
}
```

### Delete Server (Admins Only)
```bash
DELETE /api/servers/{vmid}
Authorization: Bearer YOUR_TOKEN
```

If a user without admin role tries this:
```json
{
  "error": "Only admins can delete servers"
}
```

### Start/Stop Server
```bash
POST /api/servers/{vmid}/start
Authorization: Bearer YOUR_TOKEN
```

---

## Authentication Endpoints

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@localhost",
    "role": "admin"
  }
}
```

### Get Current User
```bash
GET /api/auth/me
Authorization: Bearer YOUR_TOKEN
```

### Logout
```bash
POST /api/auth/logout
Authorization: Bearer YOUR_TOKEN
```

---

## JWT Token Details

### Token Format

The JWT token includes:
- User ID
- Username
- Role ("admin" or "user")
- Expiration (7 days from creation)

### Token Storage (Frontend)

The frontend automatically:
1. Stores token in `localStorage` as `authToken`
2. Includes token in `Authorization: Bearer` header
3. Clears token on logout
4. Validates token on app load

### Token Expiration

- **Duration**: 7 days
- **Action on expiry**: User is logged out, must login again
- **Location**: Set in `backend/auth.js`

---

## Security Best Practices

### In Development

✅ Use provided demo accounts: admin/admin123, user/user123

### Before Production

⚠️ **CRITICAL**: Change these settings:

1. **Change JWT Secret**
   ```bash
   # In .env
   JWT_SECRET=your-super-secret-key-with-random-characters
   ```

2. **Change Default Passwords**
   - Delete default users
   - Create new admin user with strong password
   - Don't use "admin123"

3. **Use Strong Passwords**
   - At least 12 characters
   - Mix of uppercase, lowercase, numbers, symbols:
     ```
     Tr0p!c@lFru1t#Minecraft$2024
     ```

4. **Enable HTTPS**
   - Use SSL certificates (Let's Encrypt)
   - Configure reverse proxy (Nginx/HAProxy)

5. **Network Security**
   - Run behind VPN/firewall
   - Use allowlists for IP addresses
   - Don't expose directly to internet initially

6. **Regular Maintenance**
   - Change passwords every 3 months
   - Review user access regularly
   - Monitor login attempts
   - Delete unused user accounts

---

## Troubleshooting

### "Invalid token" Error

**Cause**: Token expired or invalid  
**Solution**: Log out and log back in

### "Insufficient permissions" Error

**Cause**: User doesn't have permission for this action  
**Solution**: 
- For deleting servers: only admins can delete
- For user management: only admins can manage users

### "User not found" After Login

**Cause**: Database not initialized  
**Solution**: 
```bash
npm run init-db
```

### Can't Log In

**Check**:
1. Backend is running: `docker-compose logs backend`
2. Database exists: `backend/minecraft-manager.db`
3. Username/password correct
4. JWT_SECRET is set (or using default)

---

## Database Schema

The authentication system uses three tables:

### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,  -- Bcrypt hashed
  role TEXT DEFAULT 'user',      -- 'admin' or 'user'
  created_at DATETIME,
  last_login DATETIME
)
```

### Sessions Table
```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at DATETIME,
  expires_at DATETIME
)
```

### Server Clones Audit Log
```sql
CREATE TABLE server_clones (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  source_vmid INTEGER,
  new_vmid INTEGER,
  new_name TEXT,
  created_at DATETIME,
  status TEXT  -- 'pending', 'running', 'completed', 'failed'
)
```

---

## Advanced: API Usage with Tokens

### Get Token (Login First)
```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo $TOKEN
```

### Use Token in Requests
```bash
curl http://localhost:5000/api/servers \
  -H "Authorization: Bearer $TOKEN"
```

### Create New User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "new@example.com",
    "password": "password123",
    "role": "user"
  }'
```

---

## Migration from No Auth to Auth System

If you're upgrading from version without authentication:

1. **Backup database**: 
   ```bash
   cp backend/minecraft-manager.db backend/minecraft-manager.db.backup
   ```

2. **Run initialization**:
   ```bash
   npm run init-db
   ```

3. **Update frontend**: Clear browser cache and hard refresh (Ctrl+F5)

4. **Test login**: Try login with admin/admin123

---

## Support

For issues with authentication:
- Check backend logs: `docker-compose logs -f backend`
- Verify .env has JWT_SECRET set
- Ensure database initialized: `npm run init-db`
- Check browser console (F12) for API errors
