import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Put MapLibre's worker where MapLibre will look for it.
 *
 * MapLibre works out its worker's address at runtime, from its own location:
 *
 *   const here = import.meta.url;
 *   return new URL('./maplibre-gl-worker.mjs', here).href;
 *
 * That is a computed string, not a `new URL(…, import.meta.url)` a bundler can
 * recognise, so Rollup has no idea a file is being referenced and emits
 * nothing. In the build, `import.meta.url` becomes the hashed app bundle, and
 * the worker is fetched from beside it — where there is no such file.
 *
 * The result is quiet in a way that cost an evening: the style loads, the
 * sprite loads, the TileJSON loads, the canvas appears with its zoom controls
 * and attribution, and not one tile is ever requested, because everything
 * except the main thread's own fetches happens in a worker that never started.
 *
 * So both files are copied next to the bundle under their exact names — the
 * worker, and the shared chunk it imports in turn.
 */
function maplibreWorker() {
  const require = createRequire(import.meta.url);
  const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

  return {
    name: 'pulse-maplibre-worker',
    apply: 'build',
    generateBundle(options) {
      const dir = path.dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
      const assets = options.assetFileNames?.split('/')[0] ?? 'assets';
      for (const name of FILES) {
        const from = path.join(dir, name);
        if (!fs.existsSync(from)) {
          // Better to fail the build than to ship the silent version of this.
          this.error(`maplibre-gl is missing ${name}; the map would load no tiles.`);
        }
        this.emitFile({ type: 'asset', fileName: `${assets}/${name}`, source: fs.readFileSync(from) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), maplibreWorker()],
  optimizeDeps: {
    // The same problem in development, where Vite's dependency pre-bundling
    // rewrites the import but doesn't emit the worker. Leaving it unbundled
    // lets the worker resolve from the package itself.
    exclude: ['maplibre-gl'],
  },
});
