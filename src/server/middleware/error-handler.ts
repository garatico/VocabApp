/**
 * Error Handler Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export interface AppError extends Error {
  statusCode?:        number;
  status?:            number;
  availableLanguages?: string[];
  expectedPath?:      string;
}

export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void {
  const timestamp    = new Date().toISOString();
  const statusCode   = err.statusCode || err.status || 500;
  const isDev        = process.env.NODE_ENV === 'development';

  logger.error(`[${timestamp}] ERROR:`, {
    message: err.message,
    statusCode,
    path:    req.path,
    method:  req.method,
    stack:   err.stack,
  });

  const response: Record<string, unknown> = {
    error:      err.message || 'Internal Server Error',
    statusCode,
    timestamp,
  };

  if (isDev) {
    const details: Record<string, unknown> = {
      path:         req.path,
      method:       req.method,
      available:    err.availableLanguages,
      expectedPath: err.expectedPath,
    };
    // Strip undefined keys
    for (const key of Object.keys(details)) {
      if (details[key] === undefined) delete details[key];
    }
    response.details = details;
  }

  res.status(statusCode).json(response);
}

export default errorHandler;
