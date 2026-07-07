import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Il frontend parla con GraphHopper via /gh e con l'API via /api: niente CORS
// e funziona anche da smartphone in LAN (host: true espone il dev server).
// In dev servono attivi sia GraphHopper (:8989) sia l'API (:8790, `npm run dev` in api/).
const ghProxy = {
  '/gh': {
    target: 'http://localhost:8989',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/gh/, ''),
  },
  '/api': {
    target: 'http://localhost:8790',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { host: true, proxy: ghProxy },
  preview: { host: true, proxy: ghProxy },
});
