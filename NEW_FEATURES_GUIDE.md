# 🎯 Quick Start Guide - New Features

## Overview
All HIGH and MEDIUM priority features have been implemented. This guide will help you get started with the new functionality.

---

## 🚀 Getting Started

### 1. Automated Setup (Recommended)

If this is your first time, use the automated setup script:

**Windows:**
```powershell
.\setup.bat
```

**macOS/Linux (Fully Automated):**
```bash
chmod +x setup.sh
./setup.sh
```

✅ **On Ubuntu/Debian:** The script automatically:
- Installs Node.js if not present
- Installs Docker if not present
- Installs PostgreSQL if not present
- Installs Git (recommended)
- Configures database (user, password, database)
- Installs all dependencies
- Builds and deploys the application
- You're done in one command!

📖 See [INSTALL_GUIDE.md](INSTALL_GUIDE.md) for detailed setup instructions.

### 2. Access the Application (if using automated setup)

✅ **The app is already running!** Just visit:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000
- **API Docs:** http://localhost:5000/api-docs

### 3. Manual Start (if needed)

**Option A: Using Docker (Recommended)**
```bash
# Windows
docker-start.bat

# macOS/Linux  
./docker-start.sh

# Or manually
docker-compose up -d
```

**Option B: Using Start Scripts**
```bash
# Windows
start-app.bat

# macOS/Linux
./start-app.sh
```

**Option C: Manual Development**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm start
```

---

## 🔐 Admin Features

### Error Logs Dashboard
1. Login as admin
2. Click **"📋 Error Logs"** in the navigation
3. View all application errors with:
   - Error type and message
   - User who triggered it
   - Endpoint and IP address
   - Stack trace
4. Filter by:
   - Error type
   - Date range
5. View statistics for last 24 hours
6. Clear old logs (30+ days)

### API Performance Metrics
1. Click **"📊 Metrics"** in navigation
2. View:
   - Total requests
   - Average response time
   - Min/Max response times
   - Top endpoints by usage
3. Change time range (1h, 6h, 24h, 1 week)

### Session Management
1. Click **"🔐 Sessions"** in navigation
2. See all active user sessions
3. Revoke individual sessions
4. Revoke all sessions for a user
5. Useful for:
   - Security incidents
   - Forcing logout
   - Troubleshooting

### API Documentation
1. Click **"📚 API Documentation"** in footer
2. Interactive Swagger UI opens
3. View all endpoints and schemas
4. Test API calls directly
5. See request/response examples

---

## 👥 User Features

### Password Reset
1. On login page, click **"Forgot password?"**
2. Enter your email address
3. **Development Mode:** Reset token shown in console
4. **Production Mode:** Token sent via email (requires email config)
5. Enter reset token and new password
6. All your sessions will be revoked
7. Login with new password

### Enhanced Server List

**Search:**
- Type in search box to filter servers by name
- Search updates in real-time
- Works with other filters

**Filter:**
- Select status: All / Running / Stopped
- Combines with search

**Sort:**
- Sort by: VM ID / Name / Status
- Ascending order

**Pagination:**
- 20 servers per page
- Click Previous/Next to navigate
- Shows "Page X of Y"
- Shows total server count

---

## 🔒 Security Features

### Rate Limiting
**Automatically Active:**
- General API: 100 requests per 15 minutes
- Login attempts: 5 per 15 minutes
- Prevents brute force attacks
- Returns 429 error when exceeded

**To customize:**
Edit `backend/server.js`:
```javascript
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100 // Change this
});
```

### Password Security
- Minimum 6 characters (configurable)
- bcrypt hashing
- Reset tokens expire in 1 hour
- One-time use tokens
- Sessions revoked on reset

---

## 📊 Monitoring & Maintenance

### Error Log Cleanup
**Automatic:** No cleanup by default
**Manual:** Admin can delete logs older than 30 days

**To automate:**
Add to cron job or scheduler:
```bash
curl -X DELETE "http://localhost:5000/api/admin/error-logs/cleanup?days=30" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Session Cleanup
**Automatic:** Expired sessions cleaned on query
**Manual:** Use session management page

### Metrics Cleanup
**Automatic:** No cleanup by default
**Manual:** Delete old metrics via database

---

## 🧪 Testing New Features

### Test Password Reset
1. Create a user with email
2. Logout
3. Click "Forgot password?"
4. Enter email
5. Check console for token (dev mode)
6. Reset password
7. Login with new password

### Test Rate Limiting
1. Make 6+ login attempts quickly
2. Should see "Too many login attempts" error
3. Wait 15 minutes or restart server

### Test Pagination
1. Ensure you have 20+ servers
2. View server list
3. Should see pagination controls
4. Navigate pages
5. Try search/filter

### Test Error Logging
1. Trigger an error (e.g., invalid API call)
2. Go to Error Logs page
3. Should see the error logged
4. View details

### Test API Metrics
1. Make several API calls
2. Go to Metrics page
3. See request counts
4. See response times

---

## 🛠️ Configuration

### Email Setup (Production)
For password reset emails, configure in `.env`:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourapp.com
```

Then update `backend/server.js` password reset endpoint to send emails.

### Custom Rate Limits
Edit `backend/server.js`:
```javascript
// General API
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // requests
});

// Login
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5 // attempts
});
```

### Pagination Limits
Edit `backend/server.js` in `/api/servers` endpoint:
```javascript
const limit = parseInt(req.query.limit) || 20; // Change default
```

---

## 🐛 Troubleshooting

### Error Logs Not Showing
- Check admin permissions
- Verify backend is running
- Check browser console for errors
- Verify database migrations ran

### Password Reset Token Not Working
- Check token expiration (1 hour)
- Verify token wasn't already used
- Check console in dev mode
- Ensure email is in database

### Pagination Not Working
- Clear browser cache
- Check if server returned pagination data
- Verify API endpoint is updated
- Check browser console

### Rate Limit Too Strict
- Increase `max` in rate limiters
- Increase `windowMs` duration
- Skip successful requests for login
- Add IP whitelisting if needed

### Swagger Docs Not Loading
- Verify packages installed
- Check `/api-docs` endpoint
- Look for errors in backend logs
- Ensure `swagger.js` is imported

---

## 📝 API Endpoints Reference

### Authentication
- `POST /api/auth/login` - Login (rate limited)
- `POST /api/auth/register` - Register (admin only)
- `POST /api/auth/logout` - Logout
- `POST /api/auth/request-reset` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Servers (Enhanced)
- `GET /api/servers?page=1&limit=20&search=name&status=running&sortBy=name` - List servers

### Admin - Error Logs
- `GET /api/admin/error-logs?page=1&limit=50` - List errors
- `GET /api/admin/error-logs/stats?hours=24` - Error statistics
- `DELETE /api/admin/error-logs/cleanup?days=30` - Delete old logs

### Admin - Sessions
- `GET /api/admin/sessions` - List active sessions
- `DELETE /api/admin/sessions/:id` - Revoke session
- `DELETE /api/admin/users/:userId/sessions` - Revoke all user sessions

### Admin - Metrics
- `GET /api/admin/metrics?hours=24` - API performance metrics

### Documentation
- `GET /api-docs` - Swagger UI

---

## 🎯 Best Practices

### For Administrators
1. **Monitor Error Logs Daily**
   - Check for patterns
   - Investigate recurring errors
   - Clean up old logs monthly

2. **Review Metrics Weekly**
   - Identify slow endpoints
   - Monitor request volume
   - Optimize as needed

3. **Manage Sessions**
   - Revoke stale sessions
   - Monitor for suspicious activity
   - Force logout if needed

4. **Configure Email**
   - Set up SMTP for password reset
   - Test email delivery
   - Monitor email logs

### For Users
1. **Use Strong Passwords**
   - Minimum 6 characters (better: 12+)
   - Mix letters, numbers, symbols
   - Don't reuse passwords

2. **Use Password Reset**
   - Don't ask admin for new account
   - Self-service is faster
   - More secure

3. **Use Search/Filter**
   - Find servers quickly
   - Reduce clutter
   - Save time

---

## 📚 Additional Resources

- **Full Feature Analysis:** `FEATURE_ANALYSIS.md`
- **Implementation Details:** `IMPLEMENTATION_COMPLETE.md`
- **API Documentation:** http://localhost:5000/api-docs
- **Main README:** `README.md`

---

## ✅ Checklist

- [x] Backend dependencies installed
- [x] Database migrations complete
- [x] Frontend components created
- [x] Error logging active
- [x] Rate limiting enabled
- [x] Password reset working
- [x] Pagination implemented
- [x] Search/filter working
- [x] Session management ready
- [x] API docs available
- [x] Metrics tracking active

---

**Status:** ✅ All features ready for production!
**Version:** 2.0.0
**Date:** February 24, 2026
