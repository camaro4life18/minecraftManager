import { ErrorLog, ApiMetric } from './database.js';

// Error logging middleware
export async function logError(error, req, userId = null) {
  try {
    const errorType = error.name || 'Error';
    const errorMessage = error.message || 'Unknown error';
    const stackTrace = error.stack || null;
    const endpoint = req.path || req.url;
    const method = req.method;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.get('user-agent');
    const requestBody = JSON.stringify(req.body).substring(0, 1000); // Limit size

    await ErrorLog.create(
      errorType,
      errorMessage,
      stackTrace,
      userId,
      endpoint,
      method,
      ipAddress,
      userAgent,
      requestBody
    );
  } catch (loggingError) {
    console.error('Failed to log error to database:', loggingError);
  }
}

// API metrics middleware
export function metricsMiddleware(req, res, next) {
  const startTime = Date.now();
  
  // Capture the original end function
  const originalEnd = res.end;
  
  // Override the end function to capture metrics
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    const endpoint = req.path || req.url;
    const method = req.method;
    const statusCode = res.statusCode;
    const userId = req.user?.userId || null;

    // Log metrics asynchronously (don't wait)
    ApiMetric.create(endpoint, method, responseTime, statusCode, userId)
      .catch(err => console.error('Failed to log API metric:', err));

    // Call the original end function
    originalEnd.apply(res, args);
  };

  next();
}

// Global error handler middleware
export function errorHandler(err, req, res, next) {
  // Log the error
  const userId = req.user?.userId || null;
  logError(err, req, userId);

  // Send error response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}
