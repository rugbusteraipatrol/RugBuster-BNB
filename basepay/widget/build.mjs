import { build, context } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

/**
 * One self-contained IIFE. The widget is pasted into a Webflow page as a single
 * <script> tag, so it can have no imports, no CSS file, and no runtime deps.
 */
const options = {
  entryPoints: ['src/index.ts'],
  outfile: 'dist/widget.js',
  bundle: true,
  format: 'iife',
  target: ['es2020', 'chrome90', 'firefox90', 'safari15', 'edge90'],
  platform: 'browser',
  minify: !watch,
  sourcemap: true,
  legalComments: 'inline',
  banner: { js: '/* BasePay widget — non-custodial USDC checkout on Base. MIT. */' },
  logLevel: 'info',
};

await mkdir('dist', { recursive: true });

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching widget sources…');
} else {
  const result = await build({ ...options, metafile: true });
  const bytes = Object.values(result.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
  await writeFile('dist/.build-info.json', JSON.stringify({ builtAt: new Date().toISOString(), bytes }, null, 2));
  console.log(`widget bundle: ${(bytes / 1024).toFixed(1)} kB`);
}
