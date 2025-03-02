import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';

export function createDbClient(db: D1Database) {
  return drizzle(db);
} 