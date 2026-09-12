import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Keep pino out of the test output; tests assert on behaviour, not logs.
    env: { LOG_LEVEL: 'silent' },
    include: ['test/**/*.test.ts'],
    // Integration tests share one Postgres database and truncate between cases,
    // so files must not run concurrently.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/db/migrate-cli.ts'],
    },
  },
});
