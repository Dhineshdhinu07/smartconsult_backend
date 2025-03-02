import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRouter from './routes/auth';
import bookingRouter from './routes/booking';
import adminRouter from './routes/admin';
import paymentRouter from './routes/payment';
import { createCashfreeService } from './services/cashfree';
import type { D1Database } from '@cloudflare/workers-types';
import { DrizzleD1Database, drizzle } from 'drizzle-orm/d1';

// Define environment bindings type
type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  NODE_ENV?: string;
  FRONTEND_URL: string;
  CASHFREE_CLIENT_ID: string;
  CASHFREE_CLIENT_SECRET: string;
  CASHFREE_API_VERSION?: string;
};

// Define custom variables for the Hono context
type Variables = {
  db: DrizzleD1Database;
  Cashfree: ReturnType<typeof createCashfreeService>;
};

// Validate environment variables
function validateEnv(env: Bindings): void {
  const required = [
    'DB',
    'JWT_SECRET',
    'FRONTEND_URL',
    'CASHFREE_CLIENT_ID',
    'CASHFREE_CLIENT_SECRET'
  ];

  const missing = required.filter(key => !env[key as keyof Bindings]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Initialize Hono app
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Add CORS middleware
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://localhost:3000'],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-webhook-signature'],
  exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
  maxAge: 600,
}));

// Add environment validation and initialization middleware
app.use('*', async (c, next) => {
  try {
    // Validate environment variables
    validateEnv(c.env);

    // Initialize database
    c.set('db', drizzle(c.env.DB));

    // Initialize Cashfree service
    const environment = c.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX';
    const cashfreeService = createCashfreeService(
      c.env.CASHFREE_CLIENT_ID,
      c.env.CASHFREE_CLIENT_SECRET,
      environment,
      c.env.CASHFREE_API_VERSION || '2022-09-01'
    );

    // Set Cashfree service in context variables
    c.set('Cashfree', cashfreeService);

    await next();
  } catch (error) {
    console.error('Initialization error:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
    return c.json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    }, 500);
  }
});

// Basic route
app.get('/', (c) => {
  return c.json({
    message: 'Welcome to SmartConsult Backend API',
    version: '1.0.0',
    environment: c.env.NODE_ENV || 'development'
  });
});

// Mount routes
app.route('/auth', authRouter);
app.route('/api', bookingRouter);
app.route('/admin', adminRouter);
app.route('/api/payments', paymentRouter);

// Test routes without authentication
app.post('/test/payment', async (c) => {
  try {
    const cashfree = c.var.Cashfree;
    
    // Create a test order
    const testOrder = {
      order_id: `test_${Date.now()}`,
      order_amount: 1,
      order_currency: 'INR',
      customer_details: {
        customer_id: 'test_customer',
        customer_name: 'Test User',
        customer_email: 'test@example.com',
        customer_phone: '9876543210'
      },
      order_meta: {
        notify_url: 'http://localhost:8787/api/payments/webhook'
      },
      order_note: 'Test payment',
      order_tags: {
        return_url: 'http://localhost:3000/payment-status'
      }
    };

    // Call Cashfree API
    const data = await cashfree.createOrder(testOrder);
    
    return c.json({
      success: true,
      message: 'Test payment order created',
      order_details: data
    });
  } catch (error) {
    console.error('Test payment error:', error);
    return c.json({
      success: false,
      message: error instanceof Error ? error.message : 'Test payment failed',
      error: error instanceof Error ? error.stack : undefined
    }, 500);
  }
});

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,
  // Add any Durable Objects or other bindings here if needed
};
