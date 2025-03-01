import { Context, Next } from "hono";
import { Variables, Bindings } from "./auth";

export async function adminAuth(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
  const user = c.get("user");
  
  if (user.role !== "admin") {
    return c.json({ 
      error: "Forbidden",
      message: "Admin access required" 
    }, 403);
  }

  await next();
} 