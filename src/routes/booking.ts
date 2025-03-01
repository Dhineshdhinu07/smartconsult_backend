import { Hono } from "hono";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { bookings } from "../schema/booking";
import { eq, and, like, desc, asc, sql, SQL } from "drizzle-orm";
import { verifyAuth, Variables, Bindings } from "../middleware/auth";
import { drizzle } from "drizzle-orm/d1";
import type { InferModel } from 'drizzle-orm';

// Zod schema for booking validation
const bookingSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid date format. Use YYYY-MM-DDTHH:mm"),
  amount: z.number().positive("Amount must be positive")
});

// Query parameters validation schema
const querySchema = z.object({
  page: z.string().transform(Number).default("1"),
  limit: z.string().transform(Number).default("10"),
  search: z.string().optional(),
  sortBy: z.enum(["date", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(["pending", "success", "failed"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
});

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Add database middleware
app.use("*", async (c, next) => {
  // Initialize database connection
  c.set("db", drizzle(c.env.DB));
  await next();
});

// Protect all routes with authentication
app.use("*", verifyAuth);

app.post("/booking", async (c) => {
  try {
    const body = await c.req.json();
    
    // Validate input
    const validatedData = bookingSchema.parse(body);
    
    // Generate unique booking ID
    const bookingId = uuidv4();
    
    // Initialize Cashfree payment (mock for now)
    const paymentStatus = "success"; // In real implementation, this would come from Cashfree API
    
    // Generate a mock Zoho meet link
    const meetLink = `https://meet.zoho.com/${bookingId}`; // Mock link for now
    
    // Store booking in database
    const db = c.get("db");
    const user = c.get("user");
    
    await db.insert(bookings).values({
      id: bookingId,
      name: validatedData.name,
      email: user.email, // Use authenticated user's email
      date: validatedData.date,
      paymentStatus,
      meetLink,
      createdAt: Date.now()
    });
    
    // Return response
    return c.json({
      bookingId,
      meetLink,
      status: paymentStatus
    }, 201);
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: "Validation failed",
        details: error.errors
      }, 400);
    }
    
    console.error("Booking error:", error);
    return c.json({
      error: "Internal server error"
    }, 500);
  }
});

// Get user's bookings with pagination, search, and filters
app.get("/bookings", async (c) => {
  try {
    const query = c.req.query();
    const { page, limit, search, sortBy, sortOrder, status, startDate, endDate } = querySchema.parse(query);
    
    // Get authenticated user's email
    const user = c.get("user");
    const db = c.get("db");

    // Build query parts
    const queries: SQL<unknown>[] = [eq(bookings.email, user.email)];

    // Add filters
    if (status) {
      queries.push(eq(bookings.paymentStatus, status));
    }

    if (startDate && endDate) {
      queries.push(sql`date(${bookings.date}) >= date(${startDate})`);
      queries.push(sql`date(${bookings.date}) <= date(${endDate})`);
    }

    if (search) {
      queries.push(like(bookings.name, `%${search}%`));
    }

    // Combine all conditions
    const whereClause = and(...queries);

    // Get total count
    const totalCount = await db
      .select({ count: sql`count(*)` })
      .from(bookings)
      .where(whereClause);
    
    const total = Number(totalCount[0].count);

    // Get paginated results with sorting
    const sortColumn = bookings[sortBy];
    const sortFn = sortOrder === "desc" ? desc : asc;
    
    const results = await db
      .select()
      .from(bookings)
      .where(whereClause)
      .orderBy(sortFn(sortColumn))
      .limit(limit)
      .offset((page - 1) * limit);

    return c.json({
      data: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: "Invalid query parameters",
        details: error.errors
      }, 400);
    }

    console.error("Error fetching bookings:", error);
    return c.json({
      error: "Internal server error"
    }, 500);
  }
});

export default app; 