import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Single source of truth for the version shown in the status bar:
// package.json, read at build time and injected as a compile-time constant.
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  server: { port: 5174, open: true },
  build: { outDir: 'dist', sourcemap: true },
  define: { __APP_VERSION__: JSON.stringify(version) },
});
