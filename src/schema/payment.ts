import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  paymentSessionId: text('payment_session_id'),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  status: text('status').notNull(),
  paymentMethod: text('payment_method'),
  paymentTime: text('payment_time'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  paymentId: text('payment_id').notNull(),
  status: text('status').notNull(),
  paymentStatus: text('payment_status').notNull(),
  meetLink: text('meet_link'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});