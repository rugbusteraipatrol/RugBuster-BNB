import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import type pg from 'pg';
import type { Config } from '../config.js';
import type { PriceService } from '../price/priceService.js';
import type { SessionService } from '../sessions/sessionService.js';
import type { Watcher } from '../watcher/watcher.js';
import { errorHandler, notFoundHandler } from './middleware.js';
import { adminRoutes } from './routes/admin.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';

/** server/ — the same whether we are running from src/ (tsx) or dist/ (node). */
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface AppDependencies {
  config: Config;
  pool: pg.Pool;
  priceService: PriceService;
  sessionService: SessionService;
  watcher: Watcher | null;
}

export function createApp(deps: AppDependencies): Express {
  const { config, pool, priceService, sessionService, watcher } = deps;
  const app = express();

  // The widget runs on the merchant's own domain (Webflow), so requests are
  // cross-origin by construction. Nothing here is authenticated by a cookie, so
  // credentials stay off and CORS is not load-bearing for security.
  app.use(
    cors({
      origin: config.http.corsAllowedOrigins === '*' ? true : config.http.corsAllowedOrigins,
      credentials: false,
      methods: ['GET', 'POST', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '32kb' }));
  app.disable('x-powered-by');
  // Behind a single reverse proxy in the Docker/Railway setups; needed for req.ip.
  app.set('trust proxy', 1);

  app.use(healthRoutes(config, pool, priceService, watcher));
  app.use('/api', sessionRoutes(config, sessionService));
  app.use('/admin', adminRoutes(config, pool));

  if (config.http.serveWidget) {
    const distDir = config.http.widgetDistDir ?? path.resolve(SERVER_ROOT, '..', 'widget', 'dist');
    const demoDir = config.http.widgetDemoDir ?? path.resolve(SERVER_ROOT, '..', 'widget', 'demo');
    app.use('/widget', express.static(distDir, { maxAge: '5m', fallthrough: true }));
    app.use('/demo', express.static(demoDir, { maxAge: 0, fallthrough: true }));
  }

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}
