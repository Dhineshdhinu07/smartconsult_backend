import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { bookings, payments, users } from '../schema/payment'
import { OrderRequest, PaymentResponse } from '../services/cashfree'
import type { D1Database } from '@cloudflare/workers-types'

// Define env type for this controller
type Env = {
  DB: D1Database
  Cashfree: {
    createOrder: (orderData: OrderRequest) => Promise<PaymentResponse>
    verifyOrder: (orderId: string) => Promise<PaymentResponse>
    verifyWebhookSignature: (payload: any, signature: string) => Promise<boolean>
  }
}

// Initialize router
const app = new Hono<{ Bindings: Env }>()

// Create payment session
app.post('/payment', async (c) => {
  try {
    const db = drizzle(c.env.DB)
    const cashfree = c.env.Cashfree
    const body = await c.req.json()
    
    // Validate request
    if (!body.order_id || !body.order_amount || !body.order_currency || !body.customer_details) {
      throw new HTTPException(400, { message: 'Missing required payment fields' })
    }

    // Ensure customer_phone is set
    const customerPhone = body.customer_details.customer_phone || '0000000000'

    // Get frontend URL from request origin or use default
    const frontendUrl = c.req.header('Origin') || 'http://localhost:5173'

    // Prepare request to Cashfree API
    const paymentRequest: OrderRequest = {
      order_id: body.order_id,
      order_amount: body.order_amount,
      order_currency: body.order_currency,
      customer_details: {
        customer_id: body.customer_details.customer_id,
        customer_name: body.customer_details.customer_name,
        customer_email: body.customer_details.customer_email,
        customer_phone: customerPhone,
      },
      order_meta: {
        return_url: `${c.req.url.split('/payment')[0]}/payment-status/${body.order_id}`,
        notify_url: `${c.req.url.split('/payment')[0]}/payment/webhook`,
        ...body.order_meta
      },
      order_note: 'Consultation booking',
    }

    // Call Cashfree API to create order and get payment session
    const data = await cashfree.createOrder(paymentRequest)
    console.log('Payment creation response:', JSON.stringify(data))

    // Store initial payment info
    const paymentRecord = {
      id: crypto.randomUUID(),
      orderId: data.order_id,
      paymentSessionId: data.payment_session_id,
      amount: body.order_amount,
      currency: body.order_currency,
      status: data.order_status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    console.log('Inserting payment record:', JSON.stringify(paymentRecord))

    await db.insert(payments).values(paymentRecord)

    return c.json({
      success: true,
      order_id: data.order_id,
      payment_session_id: data.payment_session_id,
      order_status: data.order_status
    })
  } catch (error) {
    console.error('Payment creation error:', error)
    if (error instanceof HTTPException) {
      return c.json({ success: false, message: error.message }, error.status)
    }
    return c.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error',
      error: error instanceof Error ? error.stack : undefined
    }, 500)
  }
})

// Payment status endpoint
app.get('/payment-status/:orderId', async (c) => {
  try {
    const orderId = c.req.param('orderId')
    if (!orderId) {
      throw new HTTPException(400, { message: 'Order ID is required' })
    }

    const db = drizzle(c.env.DB)
    const cashfree = c.env.Cashfree

    // Get existing payment record first
    const [existingPayment] = await db.select()
      .from(payments)
      .where(eq(payments.orderId, orderId))

    if (!existingPayment) {
      throw new HTTPException(404, { message: 'Payment record not found' })
    }

    // Get order details from Cashfree
    let paymentData;
    try {
      paymentData = await cashfree.verifyOrder(orderId)
      console.log('Payment verification response:', JSON.stringify(paymentData))
    } catch (error) {
      console.error('Cashfree verification error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new HTTPException(502, { message: `Payment verification failed: ${errorMessage}` })
    }

    // Map Cashfree status to our status
    const statusMap: Record<string, string> = {
      'PAID': 'SUCCESS',
      'FAILED': 'FAILED',
      'CANCELLED': 'CANCELLED',
      'PENDING': 'PENDING',
      'USER_DROPPED': 'CANCELLED',
      'EXPIRED': 'EXPIRED'
    }

    const mappedStatus = statusMap[paymentData.order_status] || 'UNKNOWN'
    
    // Update payment status
    await db.update(payments)
      .set({
        status: paymentData.order_status,
        paymentMethod: paymentData.payment_method,
        paymentTime: paymentData.payment_time,
        updatedAt: new Date().toISOString()
      })
      .where(eq(payments.orderId, orderId))
    
    // Update booking status if payment is successful
    if (paymentData.order_status === 'PAID') {
      const [booking] = await db.select()
        .from(bookings)
        .where(eq(bookings.paymentId, orderId))

      if (booking) {
        await db.update(bookings)
          .set({ 
            status: 'confirmed',
            updatedAt: new Date().toISOString()
          })
          .where(eq(bookings.paymentId, orderId))
      }
    }

    // Get the frontend URL from request origin or use default
    const frontendUrl = c.req.header('Origin') || 'http://localhost:3000'
    
    // Return detailed payment status
    return c.json({
      success: true,
      order_id: orderId,
      status: mappedStatus,
      payment_details: {
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        method: paymentData.payment_method,
        time: paymentData.payment_time
      },
      message: getStatusMessage(mappedStatus)
    })
  } catch (error) {
    console.error('Payment status error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return c.json({ 
      success: false, 
      status: 'ERROR',
      message: errorMessage,
      error_details: error instanceof Error ? error.stack : undefined
    }, error instanceof HTTPException ? error.status : 500)
  }
})

// Helper function to get status message
function getStatusMessage(status: string): string {
  switch (status) {
    case 'SUCCESS':
      return 'Payment completed successfully'
    case 'FAILED':
      return 'Payment failed. Please try again'
    case 'CANCELLED':
      return 'Payment was cancelled'
    case 'PENDING':
      return 'Payment is being processed'
    case 'EXPIRED':
      return 'Payment session expired'
    default:
      return 'Unable to determine payment status'
  }
}

// Verify payment status
app.post('/verify', async (c) => {
  try {
    const db = drizzle(c.env.DB)
    const cashfree = c.env.Cashfree
    let body;
    
    try {
      body = await c.req.json()
    } catch (error) {
      throw new HTTPException(400, { message: 'Invalid JSON in request body' })
    }
    
    if (!body.orderId) {
      throw new HTTPException(400, { message: 'Order ID is required' })
    }

    // Get order details from Cashfree
    let paymentData;
    try {
      paymentData = await cashfree.verifyOrder(body.orderId)
    } catch (error) {
      console.error('Cashfree API error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new HTTPException(502, { message: `Failed to verify payment with Cashfree: ${errorMessage}` })
    }
    
    // Get existing payment record
    const [existingPayment] = await db.select()
      .from(payments)
      .where(eq(payments.orderId, body.orderId))

    if (!existingPayment) {
      throw new HTTPException(404, { message: 'Payment record not found' })
    }

    // Update payment status
    await db.update(payments)
      .set({
        status: paymentData.order_status,
        paymentMethod: paymentData.payment_method,
        paymentTime: paymentData.payment_time,
        updatedAt: new Date().toISOString()
      })
      .where(eq(payments.orderId, body.orderId))
    
    // Update booking status if payment is successful
    if (paymentData.order_status === 'PAID') {
      const [booking] = await db.select()
        .from(bookings)
        .where(eq(bookings.paymentId, body.orderId))

      if (booking) {
        await db.update(bookings)
          .set({ 
            status: 'confirmed',
            updatedAt: new Date().toISOString()
          })
          .where(eq(bookings.paymentId, body.orderId))
      }
    }

    return c.json({
      success: true,
      status: paymentData.order_status,
      order_id: paymentData.order_id,
      payment_details: {
        method: paymentData.payment_method,
        time: paymentData.payment_time,
        amount: existingPayment.amount,
        currency: existingPayment.currency
      }
    })
  } catch (error) {
    console.error('Payment verification error:', error)
    if (error instanceof HTTPException) {
      return c.json({ 
        success: false, 
        message: error.message
      }, error.status)
    }
    return c.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error',
      error: error instanceof Error ? error.stack : undefined
    }, 500)
  }
})

// Webhook for payment notifications
app.post('/webhook', async (c) => {
  try {
    const db = drizzle(c.env.DB)
    const cashfree = c.env.Cashfree
    const body = await c.req.json()
    
    // Verify webhook signature
    const signature = c.req.header('x-webhook-signature')
    if (signature) {
      const isValid = await cashfree.verifyWebhookSignature(body, signature)
      if (!isValid) {
        throw new HTTPException(401, { message: 'Invalid signature' })
      }
    }
    
    // Update payment and booking status
    if (body.data && body.data.order && body.data.order.order_id) {
      const orderId = body.data.order.order_id
      const orderStatus = body.data.order.order_status
      
      // Get existing payment record
      const [existingPayment] = await db.select()
        .from(payments)
        .where(eq(payments.orderId, orderId))

      if (!existingPayment) {
        throw new HTTPException(404, { message: 'Payment record not found' })
      }

      // Update payment status with webhook data
      await db.update(payments)
        .set({
          status: orderStatus,
          paymentMethod: body.data.payment?.payment_method || existingPayment.paymentMethod,
          paymentTime: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .where(eq(payments.orderId, orderId))
      
      // Update booking status if payment is successful
      if (orderStatus === 'PAID') {
        const [booking] = await db.select()
          .from(bookings)
          .where(eq(bookings.paymentId, orderId))

        if (booking) {
          await db.update(bookings)
            .set({ 
              status: 'confirmed',
              updatedAt: new Date().toISOString()
            })
            .where(eq(bookings.paymentId, orderId))
        }
      }

      return c.json({ 
        success: true,
        message: 'Payment status updated',
        order_id: orderId,
        status: orderStatus
      })
    }
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    if (error instanceof HTTPException) {
      return c.json({ success: false, message: error.message }, error.status)
    }
    return c.json({ success: false, message: 'Internal server error' }, 500)
  }
})

export default app