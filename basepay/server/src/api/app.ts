import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import type pg from 'pg';
import type { Activity } from '../activity.js';
import type { Config } from '../config.js';
import type { PriceService } from '../price/priceService.js';
import type { SessionService } from '../sessions/sessionService.js';
import type { Watcher } from '../watcher/watcher.js';
import { errorHandler, notFoundHandler } from './middleware.js';
import { adminRoutes } from './routes/admin.js';
import { healthRoutes } from './routes/health.js';
import { merchantRoutes, type MerchantRoutesOptions } from './routes/merchants.js';
import { onrampPageRoutes } from './routes/onrampPage.js';
import { sessionRoutes } from './routes/sessions.js';

/** server/ — the same whether we are running from src/ (tsx) or dist/ (node). */
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface AppDependencies {
  config: Config;
  pool: pg.Pool;
  priceService: PriceService;
  sessionService: SessionService;
  watcher: Watcher | null;
  merchantRoutes?: MerchantRoutesOptions;
  activity?: Activity | null;
}

export function createApp(deps: AppDependencies): Express {
  const { config, pool, priceService, sessionService, watcher } = deps;
  const activity = deps.activity ?? null;
  const app = express();

  // The widget runs on the merchant's own domain (Webflow), so requests are
  // cross-origin by construction. Nothing here is authenticated by a cookie, so
  // credentials stay off and CORS is not load-bearing for security.
  app.use(
    cors({
      origin: config.http.corsAllowedOrigins === '*' ? true : config.http.corsAllowedOrigins,
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '32kb' }));
  app.disable('x-powered-by');
  // Behind a single reverse proxy in the Docker/Railway setups; needed for req.ip.
  app.set('trust proxy', 1);

  app.use(healthRoutes(config, pool, priceService, watcher, activity));
  // Sessions only come from these routes, so any request here wakes the
  // background loops before its handler can create one. The landing page and
  // the widget files below never touch the database and do not wake it.
  if (activity) {
    app.use(['/api', '/admin'], (_req, _res, next) => {
      activity.wake();
      next();
    });
  }
  app.use('/api', sessionRoutes(config, sessionService));
  app.use('/api', merchantRoutes(config, pool, deps.merchantRoutes ?? {}));
  app.use('/admin', adminRoutes(config, pool));
  app.use(onrampPageRoutes());

  if (config.http.serveWidget) {
    const distDir = config.http.widgetDistDir ?? path.resolve(SERVER_ROOT, '..', 'widget', 'dist');
    const demoDir = config.http.widgetDemoDir ?? path.resolve(SERVER_ROOT, '..', 'widget', 'demo');
    app.use('/widget', express.static(distDir, { maxAge: '5m', fallthrough: true }));
    app.use('/demo', express.static(demoDir, { maxAge: 0, fallthrough: true }));
  }

  if (config.http.serveSite) {
    // Mounted last of the static handlers so it cannot shadow /api, /admin,
    // /widget or /demo. Serves the landing page at `/`, plus robots.txt and
    // sitemap.xml, which have to live at the domain root to be honoured.
    const siteDir = config.http.siteDir ?? path.resolve(SERVER_ROOT, '..', 'site');
    app.use(express.static(siteDir, { maxAge: '10m', fallthrough: true, index: 'index.html' }));
  }

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}
