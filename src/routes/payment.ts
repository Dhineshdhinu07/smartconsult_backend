import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { payments, bookings, users } from '../schema/payment';
import { createDbClient } from '../db';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { OrderRequest, PaymentResponse } from '../services/cashfree';

interface Env {
  DB: D1Database;
}

interface Variables {
  Cashfree: {
    createOrder: (orderData: OrderRequest) => Promise<PaymentResponse>;
    verifyOrder: (orderId: string) => Promise<PaymentResponse>;
    verifyWebhookSignature: (payload: any, signature: string) => Promise<boolean>;
  };
}

const paymentRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// Test endpoint to check Cashfree integration
paymentRouter.post('/test', async (c) => {
  try {
    const cashfree = c.var.Cashfree;
    
    // Create a test order
    const testOrder: OrderRequest = {
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
        return_url: 'http://localhost:3000/payment-status',
        notify_url: 'http://localhost:8787/api/payments/webhook'
      },
      order_note: 'Test payment'
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
      message: error instanceof Error ? error.message : 'Test payment failed'
    }, 500);
  }
});

// Create payment session
paymentRouter.post('/', async (c) => {
  try {
    const db = createDbClient(c.env.DB);
    const cashfree = c.var.Cashfree;
    const body = await c.req.json();
    
    // Validate request
    if (!body.order_id || !body.order_amount || !body.order_currency || !body.customer_details) {
      throw new HTTPException(400, { message: 'Missing required payment fields' });
    }

    // Ensure customer_phone is set
    const customerPhone = body.customer_details.customer_phone || '0000000000';

    // Get frontend URL from request origin or use default
    const frontendUrl = c.req.header('Origin') || 'http://localhost:3000';

    // Prepare request to Cashfree API
    const paymentRequest: OrderRequest = {
      order_id: body.order_id,
      order_amount: body.order_amount,
      order_currency: body.order_currency,
      customer_details: {
        customer_id: body.customer_details.customer_id,
        customer_name: body.customer_details.customer_name,
        customer_email: body.customer_details.customer_email || 'test@example.com',
        customer_phone: customerPhone,
      },
      order_meta: {
        notify_url: `${c.req.url.split('/api/payments')[0]}/api/payments/webhook`,
        ...body.order_meta
      },
      order_note: 'Consultation booking',
      order_tags: {
        return_url: `${frontendUrl}/payment-status/${body.order_id}`
      }
    };

    // Call Cashfree API to create order and get payment session
    const data = await cashfree.createOrder(paymentRequest);

    // Store initial payment info
    const paymentRecord = {
      id: nanoid(),
      orderId: data.order_id,
      paymentSessionId: data.payment_session_id,
      amount: body.order_amount,
      currency: body.order_currency,
      status: data.order_status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.insert(payments).values(paymentRecord);

    return c.json({
      success: true,
      order_id: data.order_id,
      payment_session_id: data.payment_session_id,
      order_status: data.order_status
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    if (error instanceof HTTPException) {
      return c.json({ success: false, message: error.message }, error.status);
    }
    return c.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error'
    }, 500);
  }
});

// Get payment status
paymentRouter.get('/status/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId');
    if (!orderId) {
      throw new HTTPException(400, { message: 'Order ID is required' });
    }

    const db = createDbClient(c.env.DB);
    const cashfree = c.var.Cashfree;

    // Get existing payment record
    const [existingPayment] = await db.select()
      .from(payments)
      .where(eq(payments.orderId, orderId));

    if (!existingPayment) {
      throw new HTTPException(404, { message: 'Payment record not found' });
    }

    // Get order details from Cashfree
    const paymentData = await cashfree.verifyOrder(orderId);

    // Map Cashfree status to our status
    const statusMap: Record<string, string> = {
      'PAID': 'SUCCESS',
      'FAILED': 'FAILED',
      'CANCELLED': 'CANCELLED',
      'PENDING': 'PENDING',
      'USER_DROPPED': 'CANCELLED',
      'EXPIRED': 'EXPIRED'
    };

    const mappedStatus = statusMap[paymentData.order_status] || 'UNKNOWN';
    
    // Update payment status
    await db.update(payments)
      .set({
        status: paymentData.order_status,
        paymentMethod: paymentData.payment_method,
        paymentTime: paymentData.payment_time,
        updatedAt: new Date().toISOString()
      })
      .where(eq(payments.orderId, orderId));

    // Update booking status if payment is successful
    if (paymentData.order_status === 'PAID') {
      const [booking] = await db.select()
        .from(bookings)
        .where(eq(bookings.paymentId, orderId));

      if (booking) {
        await db.update(bookings)
          .set({ 
            status: 'confirmed',
            paymentStatus: 'completed',
            updatedAt: new Date().toISOString()
          })
          .where(eq(bookings.paymentId, orderId));
      }
    }

    return c.json({
      success: true,
      order_id: orderId,
      status: mappedStatus,
      payment_details: {
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        method: paymentData.payment_method,
        time: paymentData.payment_time
      }
    });
  } catch (error) {
    console.error('Payment status error:', error);
    if (error instanceof HTTPException) {
      return c.json({ success: false, message: error.message }, error.status);
    }
    return c.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error'
    }, 500);
  }
});

// Webhook handler for payment notifications
paymentRouter.post('/webhook', async (c) => {
  try {
    const db = createDbClient(c.env.DB);
    const cashfree = c.var.Cashfree;
    
    const signature = c.req.header('x-webhook-signature');
    const payload = await c.req.json();
    
    if (!signature) {
      throw new HTTPException(400, { message: 'Missing webhook signature' });
    }

    // Verify webhook signature
    const isValid = await cashfree.verifyWebhookSignature(payload, signature);
    if (!isValid) {
      throw new HTTPException(401, { message: 'Invalid webhook signature' });
    }

    if (!payload.data?.order?.order_id || !payload.data?.order?.order_status) {
      throw new HTTPException(400, { message: 'Invalid webhook payload' });
    }

    const orderId = payload.data.order.order_id;
    const orderStatus = payload.data.order.order_status;

    // Get existing payment record
    const [existingPayment] = await db.select()
      .from(payments)
      .where(eq(payments.orderId, orderId));

    if (!existingPayment) {
      throw new HTTPException(404, { message: 'Payment record not found' });
    }

    // Update payment status
    await db.update(payments)
      .set({
        status: orderStatus,
        paymentMethod: payload.data.payment?.payment_method || existingPayment.paymentMethod,
        paymentTime: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .where(eq(payments.orderId, orderId));

    // Update booking status if payment is successful
    if (orderStatus === 'PAID') {
      const [booking] = await db.select()
        .from(bookings)
        .where(eq(bookings.paymentId, orderId));

      if (booking) {
        // Generate meet link
        const randomMeetId = nanoid(12);
        const meetLink = `https://meeting.zoho.com/meeting/${randomMeetId}`;

        await db.update(bookings)
          .set({
            status: 'confirmed',
            paymentStatus: 'completed',
            meetLink,
            updatedAt: new Date().toISOString()
          })
          .where(eq(bookings.paymentId, orderId));
      }
    }

    return c.json({
      success: true,
      message: 'Payment status updated',
      order_id: orderId,
      status: orderStatus
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    if (error instanceof HTTPException) {
      return c.json({ success: false, message: error.message }, error.status);
    }
    return c.json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    }, 500);
  }
});

export default paymentRouter; 