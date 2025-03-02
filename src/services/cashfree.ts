// Types for Cashfree requests and responses
export interface OrderRequest {
    order_id: string;
    order_amount: number;
    order_currency: string;
    customer_details: {
      customer_id: string;
      customer_name: string;
      customer_email: string;
      customer_phone: string;
    };
    order_meta?: Record<string, any>;
    order_note?: string;
    order_tags?: Record<string, string>;
  }
  
  export interface PaymentResponse {
    order_id: string;
    payment_session_id: string;
    order_status: string;
    payment_method: string | null;
    payment_time: string | null;
  }
  
  interface CashfreeError {
    message: string;
    code?: string;
    type?: string;
  }
  
  interface CashfreeOrderResponse {
    order_id: string;
    payment_session_id: string;
    order_status: string;
  }
  
  interface CashfreePaymentResponse {
    payment_status: string;
    payment_method?: string;
    payment_time?: string;
  }
  
  interface CashfreeOrderStatusResponse {
    order_id: string;
    payment_session_id: string;
    order_status: string;
    payment_method?: string;
    payment_time?: string;
  }
  
  // Helper function to generate HMAC signature using Web Crypto API
  async function generateSignature(data: any, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(JSON.stringify(data))
    );
  
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }
  
  // Validation functions
  function validateOrderRequest(orderData: OrderRequest): void {
    if (!orderData.order_id) throw new Error('order_id is required');
    if (!orderData.order_amount || orderData.order_amount <= 0) throw new Error('Invalid order_amount');
    if (!orderData.order_currency) throw new Error('order_currency is required');
    if (!orderData.customer_details) throw new Error('customer_details is required');
    if (!orderData.customer_details.customer_id) throw new Error('customer_id is required');
    if (!orderData.customer_details.customer_name) throw new Error('customer_name is required');
    
    // Validate email format if provided
    if (orderData.customer_details.customer_email && 
        !orderData.customer_details.customer_email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('Invalid email format');
    }
    
    // Validate phone format if provided
    if (orderData.customer_details.customer_phone && 
        !orderData.customer_details.customer_phone.match(/^\d{10}$/)) {
      throw new Error('Invalid phone number format');
    }
  }
  
  export const createCashfreeService = (
    clientId: string,
    clientSecret: string,
    environment: 'SANDBOX' | 'PRODUCTION',
    apiVersion: string
  ) => {
    // Validate initialization parameters
    if (!clientId) throw new Error('Cashfree client ID is required');
    if (!clientSecret) throw new Error('Cashfree client secret is required');
    if (!['SANDBOX', 'PRODUCTION'].includes(environment)) {
      throw new Error('Invalid environment. Must be either SANDBOX or PRODUCTION');
    }
    if (!apiVersion) throw new Error('API version is required');
  
    const baseUrl = environment === 'PRODUCTION' 
      ? 'https://api.cashfree.com/pg' 
      : 'https://sandbox.cashfree.com/pg';
  
    const headers = {
      'x-api-version': apiVersion,
      'x-client-id': clientId,
      'x-client-secret': clientSecret,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  
    const handleApiError = (response: any): never => {
      let errorMessage = 'Cashfree API error';
      if (response.message) errorMessage = response.message;
      if (response.code) errorMessage += ` (Code: ${response.code})`;
      if (response.type) errorMessage += ` [${response.type}]`;
      throw new Error(errorMessage);
    };
  
    return {
      createOrder: async (orderData: OrderRequest): Promise<PaymentResponse> => {
        try {
          // Validate order data
          validateOrderRequest(orderData);
          
          console.log('Creating order with data:', JSON.stringify(orderData));
          
          const response = await fetch(`${baseUrl}/orders`, {
            method: 'POST',
            headers,
            body: JSON.stringify(orderData)
          });
  
          const responseData = await response.json();
          console.log('Response data:', JSON.stringify(responseData));
  
          if (!response.ok) {
            handleApiError(responseData);
          }
  
          const data = responseData as CashfreeOrderResponse;
          if (!data.order_id || !data.payment_session_id) {
            throw new Error('Invalid response format from Cashfree');
          }
  
          return {
            order_id: data.order_id,
            payment_session_id: data.payment_session_id,
            order_status: data.order_status || 'PENDING',
            payment_method: null,
            payment_time: null
          };
        } catch (error) {
          console.error('Cashfree create order error:', error);
          throw error;
        }
      },
  
      verifyOrder: async (orderId: string): Promise<PaymentResponse> => {
        if (!orderId) throw new Error('Order ID is required');
        
        try {
          const response = await fetch(`${baseUrl}/orders/${orderId}`, {
            method: 'GET',
            headers
          });
  
          let responseData;
          try {
            responseData = await response.json();
          } catch (error) {
            throw new Error('Invalid response from Cashfree API');
          }
  
          if (!response.ok) {
            handleApiError(responseData);
          }
  
          const data = responseData as CashfreeOrderStatusResponse;
          console.log('Order verification response:', JSON.stringify(data));
  
          if (!data.order_id || !data.order_status) {
            throw new Error('Invalid response format from Cashfree');
          }
  
          return {
            order_id: data.order_id,
            payment_session_id: data.payment_session_id,
            order_status: data.order_status,
            payment_method: data.payment_method || null,
            payment_time: data.payment_time || null
          };
        } catch (error) {
          console.error('Cashfree verify order error:', error);
          throw error;
        }
      },
  
      verifyWebhookSignature: async (payload: any, signature: string): Promise<boolean> => {
        if (!payload) throw new Error('Webhook payload is required');
        if (!signature) throw new Error('Webhook signature is required');
        
        try {
          const expectedSignature = await generateSignature(payload, clientSecret);
          return signature === expectedSignature;
        } catch (error) {
          console.error('Webhook signature verification error:', error);
          return false;
        }
      }
    };
  };