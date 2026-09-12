import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Config } from '../config.js';
import { AppError, unauthorized } from '../errors.js';
import { logger } from '../logger.js';

/** Express 5 forwards rejected promises to the error handler, but be explicit. */
export const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    handler(req, res).catch(next);
  };

export function requireAdmin(config: Config): RequestHandler {
  return (req, _res, next) => {
    if (!config.adminToken) {
      next(unauthorized('ADMIN_DISABLED', 'Admin API is disabled because ADMIN_TOKEN is not set'));
      return;
    }
    const header = req.header('authorization') ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!presented || !safeEqual(presented, config.adminToken)) {
      next(unauthorized('UNAUTHORIZED', 'Missing or invalid admin bearer token'));
      return;
    }
    next();
  };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Fixed-window limiter on session creation.
 *
 * Not a general-purpose rate limiter — it exists because every open session holds
 * one of a merchant's finite amount slots, so an unthrottled caller could exhaust
 * them and deny checkout to real buyers.
 */
export function rateLimitSessions(config: Config): RequestHandler {
  const windowMs = 60_000;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();
    const body = req.body as { merchantId?: unknown } | undefined;
    const merchantId = typeof body?.merchantId === 'string' ? body.merchantId : 'unknown';
    const key = `${merchantId}:${req.ip ?? 'noip'}`;

    const existing = hits.get(key);
    const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    hits.set(key, bucket);

    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    if (bucket.count > config.sessions.rateLimitPerMinute) {
      res.setHeader('retry-after', Math.ceil((bucket.resetAt - now) / 1000));
      next(new AppError('RATE_LIMITED', 429, 'Too many payment sessions requested. Slow down and retry.'));
      return;
    }
    next();
  };
}

export function errorHandler(): (err: unknown, req: Request, res: Response, next: NextFunction) => void {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      });
      return;
    }
    logger.error({ err, path: req.path, method: req.method }, 'unhandled request error');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
  };
}

export function notFoundHandler(): RequestHandler {
  return (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } });
  };
}
