import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

// NOTE: default location is ../data/app.db (repo root ./data) when running from ./web.
const dbFile = process.env.DATABASE_URL ?? path.join(process.cwd(), '..', 'data', 'app.db');

export const sqlite = new Database(dbFile);
export const db = drizzle(sqlite);
