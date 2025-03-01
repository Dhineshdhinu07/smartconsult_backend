import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRouter from './routes/auth';
import bookingRouter from './routes/booking';
import adminRouter from './routes/admin';
import type { D1Database } from '@cloudflare/workers-types';
import { DrizzleD1Database, drizzle } from 'drizzle-orm/d1';

// Define environment bindings type
type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  NODE_ENV?: string;
  FRONTEND_URL: string;
};

// Define custom variables for the Hono context
type Variables = {
  db: DrizzleD1Database;
};

// Initialize Hono app
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Add CORS middleware
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://localhost:3000'],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
  maxAge: 600,
}));

// Add database middleware
app.use('*', async (c, next) => {
  c.set('db', drizzle(c.env.DB));
  await next();
});

// Basic route
app.get('/', (c) => {
  return c.json({
    message: 'Welcome to SmartConsult Backend API'
  });
});

// Mount routes
app.route('/auth', authRouter);
app.route('/api', bookingRouter);
app.route('/admin', adminRouter);

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,
  // Add any Durable Objects or other bindings here if needed
};
