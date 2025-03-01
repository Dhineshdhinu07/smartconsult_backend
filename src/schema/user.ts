import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["user", "admin"] }).default("user"),
  createdAt: integer("created_at").notNull().default(Date.now()),
  updatedAt: integer("updated_at").notNull().default(Date.now()),
}); 