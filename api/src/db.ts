import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

/** SQLite come storage v1 (file in data/, zero infrastruttura): lo schema è
 *  volutamente piatto e portabile a PostgreSQL/PostGIS quando arriveranno
 *  multi-utente e query spaziali. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.BM_DB ?? path.resolve(__dirname, '../../data/bikemaps.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS routes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    mode        TEXT NOT NULL CHECK (mode IN ('ab', 'loop')),
    fun_profile TEXT NOT NULL CHECK (fun_profile IN ('curvy', 'balanced')),
    points      TEXT NOT NULL,  -- JSON [{lng,lat},...] (la richiesta, per riaprire e modificare)
    loop_km     INTEGER,
    seed        INTEGER,
    distance    REAL NOT NULL,
    time_ms     INTEGER NOT NULL,
    ascend      REAL NOT NULL,
    fun_avg     REAL NOT NULL,
    curvy_pct   REAL NOT NULL,
    path        TEXT NOT NULL   -- JSON RoutePath completo (render immediato del link condiviso)
  )
`);
