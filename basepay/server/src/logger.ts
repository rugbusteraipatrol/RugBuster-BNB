import pino from 'pino';

const level = process.env['LOG_LEVEL'] ?? 'info';

export const logger = pino({
  level,
  // Drop pid/hostname; the container runtime already labels lines.
  base: null,
  redact: {
    paths: ['webhookSecret', '*.webhookSecret', 'adminToken', '*.adminToken'],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
