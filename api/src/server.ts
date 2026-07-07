/**
 * API Bike Maps — entry point unico dell'app in produzione.
 *
 * - /gh/*      -> proxy verso GraphHopper (stesso prefisso usato dal dev server
 *                 Vite: il frontend non cambia tra sviluppo e produzione)
 * - /api/*     -> endpoint applicativi (health; in futuro: CRUD percorsi, auth)
 * - /*         -> frontend statico (web/dist) con fallback SPA su index.html
 *
 * Config via env: PORT (3000), HOST (0.0.0.0), GH_URL (http://localhost:8989),
 * WEB_DIST (../web/dist relativo a questo file compilato).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import httpProxy from '@fastify/http-proxy';
import fastifyStatic from '@fastify/static';
import { registerRouteEndpoints } from './routes.js';
import { registerPoiEndpoints } from './pois.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 8790 e non 3000: la 3000 e' la default di mezzo ecosistema Node e sul PC
// di sviluppo e' contesa da altri progetti (l'API e' gia' stata uccisa una
// volta da un kill-by-port altrui)
const PORT = Number(process.env.PORT ?? 8790);
const HOST = process.env.HOST ?? '0.0.0.0';
const GH_URL = process.env.GH_URL ?? 'http://localhost:8989';
const WEB_DIST = process.env.WEB_DIST ?? path.resolve(__dirname, '../../web/dist');

const app = Fastify({ logger: true });

app.get('/api/health', async () => {
  let graphhopper: 'ok' | 'unreachable' = 'unreachable';
  let profiles: string[] = [];
  try {
    const res = await fetch(`${GH_URL}/info`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      graphhopper = 'ok';
      const info = (await res.json()) as { profiles?: { name: string }[] };
      profiles = (info.profiles ?? []).map((p) => p.name);
    }
  } catch {
    // GraphHopper giù: lo riportiamo nello stato, l'API resta viva
  }
  return { status: 'ok', graphhopper, profiles };
});

registerRouteEndpoints(app);
registerPoiEndpoints(app);

await app.register(httpProxy, {
  upstream: GH_URL,
  prefix: '/gh',
  rewritePrefix: '',
});

await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });

// fallback SPA: ogni rotta non-API e non-proxy serve l'app
app.setNotFoundHandler((req, reply) => {
  const url = req.raw.url ?? '';
  if (url.startsWith('/api/') || url.startsWith('/gh/')) {
    return reply.code(404).send({ error: 'not found' });
  }
  return reply.sendFile('index.html');
});

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
