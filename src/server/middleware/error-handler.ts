/**
 * Error Handler Middleware
 *
 * Two rules worth stating, because both were wrong before:
 *
 *   - The environment comes from `createApp`, not `process.env`.
 *   - Outside development, a 5xx does not describe itself to the client. A
 *     failure to open the database used to answer the browser with the full
 *     filesystem path it tried; 4xx messages are deliberate and still sent,
 *     because "Language not found: klingon" is the useful half.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export interface AppError extends Error {
  statusCode?:        number;
  status?:            number;
  availableLanguages?: string[];
  expectedPath?:      string;
}

const GENERIC_SERVER_ERROR = 'Internal Server Error';

export function makeErrorHandler(nodeEnv: string) {
  const isDev = nodeEnv === 'development';

  return function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void {
    const timestamp  = new Date().toISOString();
    const statusCode = err.statusCode || err.status || 500;

    logger.error(`[${timestamp}] ERROR:`, {
      message: err.message,
      statusCode,
      path:    req.path,
      method:  req.method,
      stack:   err.stack,
    });

    // The full message goes to the log either way; only the client's copy is
    // withheld, and only for faults we did not deliberately raise.
    const clientMessage = (statusCode >= 500 && !isDev)
      ? GENERIC_SERVER_ERROR
      : (err.message || GENERIC_SERVER_ERROR);

    const response: Record<string, unknown> = {
      error: clientMessage,
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
  };
}
