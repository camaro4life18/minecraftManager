import jwt from 'jsonwebtoken';
import { Session } from './database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

// Generate JWT token
export function generateToken(userId, username, role) {
  return jwt.sign(
    { userId, username, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// Middleware to verify JWT token
export function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Middleware to check user role
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Insufficient permissions. Required roles: ${roles.join(', ')}` 
      });
    }

    next();
  };
}

// Middleware to require admin role
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

// Check if user can perform action based on role
export function canDeleteServer(user) {
  return user.role === 'admin';
}

export function canCloneServer(user) {
  return ['admin', 'user'].includes(user.role);
}

export function canStartStop(user) {
  return ['admin', 'user'].includes(user.role);
}

export default {
  generateToken,
  verifyToken,
  requireRole,
  requireAdmin,
  canDeleteServer,
  canCloneServer,
  canStartStop
};
