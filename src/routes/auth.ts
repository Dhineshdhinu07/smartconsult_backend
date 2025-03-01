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
import { HTTPException } from 'hono/http-exception';

// Input validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

// Type for bindings
type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

// Type for JWT payload
type JWTPayload = {
  sub: string;
  email: string;
  role: 'user' | 'admin';
};

// Create auth router
const authRouter = new Hono<{ Bindings: Bindings }>();

// Login endpoint
authRouter.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  try {
    const db = drizzle(c.env.DB);

    // Find user by email
    const user = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user) {
      throw new HTTPException(401, { message: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw new HTTPException(401, { message: 'Invalid credentials' });
    }

    // Generate JWT
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as 'user' | 'admin'
    };

    const token = await sign(payload, c.env.JWT_SECRET);

    return c.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    }, 200);

  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json({
        success: false,
        error: error.message
      }, error.status);
    }

    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      }, 400);
    }

    console.error('Login error:', error);
    return c.json({
      success: false,
      error: 'Authentication failed'
    }, 500);
  }
});

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
      throw new HTTPException(400, { message: 'User already exists' });
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
    const payload: JWTPayload = {
      sub: userId,
      email,
      role: 'user'
    };
    
    const token = await sign(payload, c.env.JWT_SECRET);
    
    return c.json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: {
          id: userId,
          email,
          name,
          role: 'user'
        }
      }
    }, 201);
    
  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json({
        success: false,
        error: error.message
      }, error.status);
    }

    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      }, 400);
    }

    console.error('Registration error:', error);
    return c.json({
      success: false,
      error: 'Registration failed'
    }, 500);
  }
});

export default authRouter; 