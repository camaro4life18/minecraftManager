# Authentication System - What's New

Your Minecraft Server Manager now has complete user authentication and role-based access control!

## 🎯 Quick Start - New Users

### For You (Admin)
1. Log in with: **admin** / **admin123**
2. You can do everything - manage users, delete servers, etc.

### For Your Son (User)
1. Ask admin (you) to create account
2. Log in with the provided credentials
3. He can clone and manage servers, but NOT delete

## 📋 What Changed

### Backend Updates ✅

**New Files:**
- `backend/database.js` - SQLite database with user/session tables
- `backend/auth.js` - JWT authentication & authorization middleware  
- `backend/init-db.js` - Initialize database with default users
- `backend/start.sh` - Startup script to auto-init database

**Updated Files:**
- `backend/server.js` - Added 13 new auth endpoints, permission checks on all server endpoints
- `backend/package.json` - Added jsonwebtoken, bcryptjs, better-sqlite3

**New Endpoints:**
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Create new user (admin only)
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/logout` - Logout
- `GET /api/users` - List all users (admin only)
- `DELETE /api/users/:userId` - Delete user (admin only)
- `PATCH /api/users/:userId/role` - Change user role (admin only)
- `GET /api/clone-history` - View clone audit trail

**Permission Changes:**
- All `/api/servers/*` endpoints now require authentication
- Clone/Start/Stop - available to admin & user roles
- Delete - admin only ⛔
- User management - admin only ⛔

### Frontend Updates ✅

**New Files:**
- `frontend/src/context/AuthContext.js` - Auth state management
- `frontend/src/components/LoginPage.js` - Login form UI
- `frontend/src/styles/LoginPage.css` - Login page styling

**Updated Files:**
- `frontend/src/App.js` - Integrated AuthProvider, login screen, logout button
- `frontend/src/components/ServerList.js` - Delete button (admin only)
- `frontend/src/components/CloneForm.js` - Passes auth token
- `frontend/src/index.css` - Updated header with user info & logout btn

**New Features:**
- Login page that appears before app
- Persistent login (7-day session)
- User info display in header
- Admin badge for admin users
- Logout button
- Delete button visible only to admins
- Token auto-refresh handling

## 🔐 Security Features

✅ Passwords hashed with bcrypt (10 rounds)  
✅ JWT tokens (7-day expiration)  
✅ Role-based access control (RBAC)  
✅ Audit trail of server clones  
✅ Automatic DB initialization  
✅ Secure password validation  

## 🚀 How to Test

### Local Development

1. Install dependencies:
```bash
cd backend && npm install
```

2. Initialize database:
```bash
npm run init-db
```

3. Start backend:
```bash
npm run dev
```

4. Start frontend (new terminal):
```bash
cd frontend && npm install && npm start
```

5. Log in:
   - Admin: admin / admin123
   - User: user / user123

### Docker

1. Build and start:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

2. Backend automatically initializes database on first run

3. Log in at http://localhost:3000

## 📚 Documentation

New docs added:
- **AUTHENTICATION.md** - Complete auth guide with API examples
- **backend/init-db.js** - Comments explaining initialization
- **backend/auth.js** - JWT & permission logic
- **backend/database.js** - Database schema & functions

## 🔄 User Workflow

**Dad (You):**
1. Log in as admin
2. Create account for son
3. Manage users if needed
4. Freely clone/delete/manage servers

**Son:**
1. Uses provided username/password
2. Sees only server management (clone, start, stop)
3. Cannot see user management or delete buttons
4. Has separate audit trail of his actions

## ⚙️ Environment Variables

New in `.env`:
```env
JWT_SECRET=your-secret-key-change-in-production
```

Default is safe for development but **CHANGE for production**.

## 🗄️ Database Schema

SQLite database with three tables:
- `users` - User accounts and roles
- `sessions` - Active login sessions  
- `server_clones` - Audit trail of clones

Auto-created on first run.

## 🔧 Default Accounts

Created automatically on first run:

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | admin |
| user | user123 | user |

⚠️ Change these immediately before production!

## 📞 Quick Commands

**Initialize database:**
```bash
npm run init-db  # or: docker-compose exec backend npm run init-db
```

**Check backend logs:**
```bash
docker-compose logs -f backend
```

**View users:**
```bash
curl -X GET http://localhost:5000/api/users \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## ✅ Testing Checklist

- [ ] Login with admin credentials
- [ ] Login with user credentials  
- [ ] Admin can see delete buttons
- [ ] User cannot see delete buttons
- [ ] Both can clone servers
- [ ] Only admin can delete servers
- [ ] Logout works
- [ ] Page reloads with persistent login
- [ ] Token expires after 7 days

## 🎉 You're Set!

Everything is ready. Just:
1. Start the app (Docker or local)
2. Log in as admin (admin/admin123)
3. Create account for your son
4. Share his credentials
5. He can start creating servers!

See **AUTHENTICATION.md** for complete details and advanced usage.
