import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { jwt } from 'hono/jwt';
import { DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import authRouter from './routes/auth';
import type { D1Database } from '@cloudflare/workers-types';

// Define environment bindings type
type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

// Initialize Hono app
const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use('*', cors());
app.use('*', prettyJSON());

// Basic route
app.get('/', (c) => {
  return c.json({
    message: 'Welcome to SmartConsult Backend API'
  });
});

// Mount auth routes
app.route('/auth', authRouter);

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,
  // Add any Durable Objects or other bindings here if needed
};
