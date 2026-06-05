/**
 * Error Handler Middleware
 *
 * Centralized error handling and response formatting
 */

export function errorHandler(err, req, res, _next) {
  // Log error
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR:`, {
    message: err.message,
    statusCode: err.statusCode || 500,
    path: req.path,
    method: req.method,
    stack: err.stack
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Build error response.
  // error is the message string (not a boolean) so admin-api.js can display it directly.
  const response = {
    error: err.message || 'Internal Server Error',
    statusCode,
    timestamp
  };

  // Add extra details in development
  if (isDevelopment) {
    response.details = {
      path: req.path,
      method: req.method,
      available: err.availableLanguages || undefined,
      expectedPath: err.expectedPath || undefined
    };

    // Remove undefined fields
    Object.keys(response.details).forEach(key => {
      if (response.details[key] === undefined) {
        delete response.details[key];
      }
    });
  }

  // Send response
  res.status(statusCode).json(response);
}

export default errorHandler;
