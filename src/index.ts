import { Hono } from 'hono';
import authRouter from './routes/auth';
import type { D1Database } from '@cloudflare/workers-types';

// Define environment bindings type
type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

// Initialize Hono app
const app = new Hono<{ Bindings: Bindings }>();
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
