import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Il frontend parla con GraphHopper attraverso il proxy /gh: niente CORS e
// funziona anche da smartphone in LAN (host: true espone il dev server).
const ghProxy = {
  '/gh': {
    target: 'http://localhost:8989',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/gh/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { host: true, proxy: ghProxy },
  preview: { host: true, proxy: ghProxy },
});
