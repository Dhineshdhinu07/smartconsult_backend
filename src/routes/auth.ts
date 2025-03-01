import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import { users } from '../schema/user';
import { sign } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

// Input validation schema
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

// Type for bindings
type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

// Create auth router
const authRouter = new Hono<{ Bindings: Bindings }>();

// Register endpoint
authRouter.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');
  
  try {
    const db = drizzle(c.env.DB);
    
    // Check if user already exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .get();
    
    if (existingUser) {
      return c.json({ error: 'User already exists' }, 400);
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const userId = nanoid();
    const newUser = {
      id: userId,
      email,
      password: hashedPassword,
      name,
      role: 'user' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await db.insert(users).values(newUser);
    
    // Generate JWT
    const token = await sign({
      sub: userId,
      email,
      role: 'user'
    }, c.env.JWT_SECRET);
    
    return c.json({
      message: 'User registered successfully',
      token,
      user: {
        id: userId,
        email,
        name,
        role: 'user'
      }
    }, 201);
    
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default authRouter; 