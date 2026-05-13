/**
 * CORS Middleware
 *
 * Configures Cross-Origin Resource Sharing
 */

export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin || req.headers.referer;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5001',
    'http://localhost:5002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5001',
    'http://127.0.0.1:5002'
  ];

  // In development, allow localhost requests
  if (process.env.NODE_ENV === 'development') {
    if (origin && origin.includes('localhost')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  } else {
    // In production, be more restrictive
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  }

  // Allow credentials
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Allow methods
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');

  // Allow headers
  res.setHeader('Access-Control-Allow-Headers', [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Admin-Key',
    'Accept',
    'Origin'
  ].join(', '));

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
}

export default corsMiddleware;
