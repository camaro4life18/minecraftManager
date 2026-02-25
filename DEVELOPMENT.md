# Local Development Setup

This guide helps you set up the project for local development without Docker.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Your Proxmox server accessible from your machine

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Create Environment File

```bash
# Copy and edit environment
cp ../.env.example .env

# Edit with your Proxmox details
# PROXMOX_HOST=your-proxmox-host
# PROXMOX_USERNAME=your-user
# PROXMOX_PASSWORD=your-password
# PORT=5000
```

### 3. Start Backend Server

```bash
# Development mode with auto-reload
npm run dev

# Or standard mode
npm start
```

The backend will run on `http://localhost:5000`

### 4. Test Backend

```bash
# In another terminal
curl http://localhost:5000/api/health
# Should return: {"status":"healthy"}
```

## Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Start Development Server

```bash
npm start
```

This opens the React development server on `http://localhost:3000`

### 3. Browser Setup

The frontend will automatically proxy API requests to the backend during development. If you need to change the API URL, create a `.env` file:

```bash
# frontend/.env
REACT_APP_API_URL=http://localhost:5000
```

## Full Local Setup (Both Services)

### Terminal 1: Backend

```bash
cd backend
npm install
npm run dev
```

### Terminal 2: Frontend

```bash
cd frontend
npm install
npm start
```

Now you have:
- Backend API: http://localhost:5000
- Frontend Web App: http://localhost:3000

## Hot Reloading

Both services support hot reloading:

- **Backend**: Changes in `backend/` automatically restart the server
- **Frontend**: Changes in `frontend/src/` automatically reload the browser

## Debugging

### Backend Debugging

Add the `--inspect` flag to enable Node.js debugging:

```bash
node --inspect server.js
```

Then open `chrome://inspect` in Chrome to debug.

### Frontend Debugging

React Dev Tools browser extension recommended. Use F12 in your browser for console debugging.

### API Debugging

```bash
# View all backend requests
curl -v http://localhost:5000/api/servers

# Test server cloning
curl -X POST http://localhost:5000/api/servers/clone \
  -H "Content-Type: application/json" \
  -d '{
    "sourceVmId": 100,
    "newVmName": "test-server",
    "newVmId": 999
  }'
```

## Common Development Tasks

### Add New Backend Route

1. Edit `backend/server.js`
2. Add route handler
3. Server auto-reloads

Example:
```javascript
app.get('/api/new-endpoint', async (req, res) => {
  res.json({ message: 'Hello' });
});
```

### Add New Frontend Component

1. Create component in `frontend/src/components/`
2. Import in `App.js`
3. Browser auto-reloads

Example:
```javascript
import NewComponent from './components/NewComponent';

// In App.js JSX
<NewComponent />
```

### Update Styles

Frontend CSS is in `frontend/src/styles/` and updates live in the browser.

## Troubleshooting

### "Cannot connect to Proxmox"

- Verify Proxmox is running and accessible: `ping your-proxmox-host`
- Check credentials in backend `.env`
- Verify Proxmox API is accessible: `curl -k https://your-proxmox-host:8006/api2/json/nodes`

### Backend Won't Start

```bash
# Check if port 5000 is already in use
lsof -i :5000  # macOS/Linux
netstat -ano | findstr :5000  # Windows

# Kill existing process or use different port
export PORT=5001
npm run dev
```

### Frontend Won't Start

```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Try again
npm start
```

### Hot Reload Not Working

- Backend: Make sure you're using `npm run dev`
- Frontend: Try restarting `npm start` if changes aren't detected
- Check file permissions

## Production Build

### Build Frontend for Production

```bash
cd frontend
npm run build
```

Creates optimized build in `frontend/build/` 

### Test Production Build Locally

```bash
# Backend remains same
cd backend
npm start

# Serve frontend build with http-server
cd frontend
npx http-server build
```

## Next Steps

- Read [DEPLOYMENT.md](DEPLOYMENT.md) to deploy with Docker
- Read [README.md](../README.md) for API documentation
- Implement user authentication for production use
