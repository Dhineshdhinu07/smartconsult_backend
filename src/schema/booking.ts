import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  date: text("date").notNull(),
  paymentStatus: text("payment_status").default("pending"),
  meetLink: text("meet_link"),
  createdAt: integer("created_at").default(Date.now()),
});
