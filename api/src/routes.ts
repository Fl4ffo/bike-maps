import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { db } from './db.js';

interface SaveBody {
  name: string;
  mode: 'ab' | 'loop';
  funProfile: 'curvy' | 'balanced';
  points: { lng: number; lat: number }[];
  loopKm?: number;
  seed?: number;
  distance: number;
  timeMs: number;
  ascend: number;
  funAvg: number;
  curvyPct: number;
  path: unknown;
}

const pointSchema = {
  type: 'object',
  required: ['lng', 'lat'],
  properties: { lng: { type: 'number' }, lat: { type: 'number' } },
} as const;

const saveSchema = {
  body: {
    type: 'object',
    required: ['name', 'mode', 'funProfile', 'points', 'distance', 'timeMs', 'ascend', 'funAvg', 'curvyPct', 'path'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      mode: { enum: ['ab', 'loop'] },
      funProfile: { enum: ['curvy', 'balanced'] },
      points: { type: 'array', minItems: 1, maxItems: 25, items: pointSchema },
      loopKm: { type: 'number' },
      seed: { type: 'number' },
      distance: { type: 'number' },
      timeMs: { type: 'number' },
      ascend: { type: 'number' },
      funAvg: { type: 'number' },
      curvyPct: { type: 'number' },
      path: { type: 'object' },
    },
  },
} as const;

interface RouteRow {
  id: string;
  name: string;
  created_at: string;
  mode: string;
  fun_profile: string;
  points: string;
  loop_km: number | null;
  seed: number | null;
  distance: number;
  time_ms: number;
  ascend: number;
  fun_avg: number;
  curvy_pct: number;
  path: string;
}

function toSummary(r: Omit<RouteRow, 'points' | 'path'>) {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    mode: r.mode,
    funProfile: r.fun_profile,
    loopKm: r.loop_km,
    distance: r.distance,
    timeMs: r.time_ms,
    ascend: r.ascend,
    funAvg: r.fun_avg,
    curvyPct: r.curvy_pct,
  };
}

export function registerRouteEndpoints(app: FastifyInstance): void {
  app.post<{ Body: SaveBody }>('/api/routes', { schema: saveSchema }, async (req, reply) => {
    const b = req.body;
    const id = crypto.randomBytes(6).toString('base64url'); // 8 caratteri, non indovinabile
    db.prepare(
      `INSERT INTO routes (id, name, mode, fun_profile, points, loop_km, seed,
                           distance, time_ms, ascend, fun_avg, curvy_pct, path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      b.name.trim(),
      b.mode,
      b.funProfile,
      JSON.stringify(b.points),
      b.loopKm ?? null,
      b.seed ?? null,
      b.distance,
      b.timeMs,
      b.ascend,
      b.funAvg,
      b.curvyPct,
      JSON.stringify(b.path),
    );
    return reply.code(201).send({ id });
  });

  app.get('/api/routes', async () => {
    const rows = db
      .prepare(
        `SELECT id, name, created_at, mode, fun_profile, loop_km,
                distance, time_ms, ascend, fun_avg, curvy_pct
         FROM routes ORDER BY created_at DESC LIMIT 100`,
      )
      .all() as Omit<RouteRow, 'points' | 'path'>[];
    return rows.map(toSummary);
  });

  app.get<{ Params: { id: string } }>('/api/routes/:id', async (req, reply) => {
    const row = db.prepare('SELECT * FROM routes WHERE id = ?').get(req.params.id) as RouteRow | undefined;
    if (!row) return reply.code(404).send({ error: 'giro non trovato' });
    return {
      ...toSummary(row),
      seed: row.seed,
      points: JSON.parse(row.points) as unknown,
      path: JSON.parse(row.path) as unknown,
    };
  });

  app.delete<{ Params: { id: string } }>('/api/routes/:id', async (req, reply) => {
    const res = db.prepare('DELETE FROM routes WHERE id = ?').run(req.params.id);
    if (res.changes === 0) return reply.code(404).send({ error: 'giro non trovato' });
    return { deleted: true };
  });
}
