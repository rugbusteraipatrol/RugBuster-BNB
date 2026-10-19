import pino from 'pino';
import { redactDeep } from './redact.js';

const level = process.env['LOG_LEVEL'] ?? 'info';

export const logger = pino({
  level,
  // Drop pid/hostname; the container runtime already labels lines.
  base: null,
  redact: {
    paths: ['webhookSecret', '*.webhookSecret', 'adminToken', '*.adminToken'],
    censor: '[redacted]',
  },
  // viem quotes the RPC URL, API key included, in its error messages and
  // request bodies. Every `err` field passes through here before it is written.
  serializers: {
    err: (err: unknown) => redactDeep(err instanceof Error ? pino.stdSerializers.err(err) : err),
  },
});

export type Logger = typeof logger;
