/**
 * Build script: bundles each TypeScript entry point with esbuild and copies
 * static assets (HTML, CSS) into dist/.
 */

import esbuild from 'esbuild';
import { solidPlugin } from 'esbuild-plugin-solid';
import fs from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');

const ENTRY_POINTS = [
  { in: 'src/background.ts',    out: 'background' },
  { in: 'src/content.ts',       out: 'content' },
  { in: 'src/devtools.ts',      out: 'devtools' },
  { in: 'src/panel/index.tsx',  out: 'panel' },
  { in: 'src/chat/index.tsx',   out: 'chat' },
];

const STATIC_FILES = [
  'src/devtools.html',
  'src/panel.html',
  'src/sidebar.html',
  'src/base.css',
  'src/styles.css',
  'src/chat.css',
  'manifest.json',
];

fs.mkdirSync('dist', { recursive: true });

function copyStatics() {
  for (const src of STATIC_FILES) {
    const dest = path.join('dist', path.basename(src));
    fs.copyFileSync(src, dest);
  }
  console.log('Copied static files.');
}

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ENTRY_POINTS,
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  plugins: [solidPlugin()],
};

if (watch) {
  const ctx = await esbuild.context({
    ...buildOptions,
    plugins: [
      solidPlugin(),
      {
        name: 'copy-statics',
        setup(build) {
          build.onEnd(() => copyStatics());
        },
      },
    ],
  });
  copyStatics();
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await esbuild.build(buildOptions);
  copyStatics();
  console.log('Build complete.');
}
