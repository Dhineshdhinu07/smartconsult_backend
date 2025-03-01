import { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { DrizzleD1Database } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";

// Define the user payload type
export interface UserPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
}

// Define custom environment bindings
export interface Bindings {
  JWT_SECRET: string;
  DB: D1Database;
  NODE_ENV?: string;
}

// Define custom variables for the Hono context
export interface Variables {
  user: UserPayload;
  db: DrizzleD1Database;
}

export async function verifyAuth(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
  try {
    // Get the authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized - No token provided" }, 401);
    }

    // Extract and verify the token
    const token = authHeader.split(" ")[1].trim();
    
    try {
      const decoded = await verify(token, c.env.JWT_SECRET);
      
      // Validate the payload structure
      if (!decoded || typeof decoded !== 'object' || !('sub' in decoded) || !('email' in decoded) || !('role' in decoded)) {
        return c.json({ error: "Invalid token payload structure" }, 401);
      }

      // Cast the payload to UserPayload after validation
      const payload: UserPayload = {
        sub: decoded.sub as string,
        email: decoded.email as string,
        role: decoded.role as 'user' | 'admin'
      };

      // Add user info to context
      c.set("user", payload);
      
      await next();
    } catch (verifyError: any) {
      console.error('Token verification error:', verifyError);
      return c.json({ 
        error: "Invalid token",
        details: c.env.NODE_ENV === 'development' ? verifyError.message : undefined 
      }, 401);
    }
  } catch (error: any) {
    console.error('Auth error:', error);
    return c.json({ 
      error: "Authentication failed",
      details: c.env.NODE_ENV === 'development' ? error.message : undefined
    }, 401);
  }
} 