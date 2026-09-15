import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // maplibre-gl loads its parser in a Web Worker. Vite's dependency
    // pre-bundling rewrites the import but doesn't emit the worker file, so in
    // dev it 404s and the map renders an empty canvas — tiles fetched, nothing
    // drawn. Leaving it unbundled lets the worker resolve from the package.
    exclude: ['maplibre-gl'],
  },
});
