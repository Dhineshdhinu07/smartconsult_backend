import { Hono } from "hono";
import { z } from "zod";
import { bookings } from "../schema/booking";
import { users } from "../schema/user";
import { eq, and, like, desc, asc, sql, SQL } from "drizzle-orm";
import { verifyAuth, Variables, Bindings } from "../middleware/auth";
import { adminAuth } from "../middleware/adminAuth";
import { drizzle } from "drizzle-orm/d1";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

// Query parameters validation schema
const querySchema = z.object({
  page: z.string().transform(Number).default("1"),
  limit: z.string().transform(Number).default("10"),
  search: z.string().optional(),
  sortBy: z.enum(["date", "createdAt", "email", "name"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(["pending", "success", "failed"]).optional(),
  email: z.string().email("Invalid email").optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
});

// Update booking schema
const updateBookingSchema = z.object({
  status: z.enum(["pending", "success", "failed"]),
  meetLink: z.string().url("Invalid meet link").optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid date format").optional(),
});

// First admin creation schema
const createFirstAdminSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  secretKey: z.string()
});

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Add database middleware
app.use("*", async (c, next) => {
  c.set("db", drizzle(c.env.DB));
  await next();
});

// Special endpoint to create first admin (no auth required)
app.post("/setup/first-admin", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name, secretKey } = createFirstAdminSchema.parse(body);

    // Verify secret key (should match an environment variable)
    if (secretKey !== c.env.ADMIN_SETUP_KEY) {
      return c.json({
        error: "Invalid setup key"
      }, 403);
    }

    const db = c.get("db");

    // Check if any admin already exists
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);

    if (existingAdmin.length > 0) {
      return c.json({
        error: "Admin user already exists"
      }, 400);
    }

    // Check if email is already taken
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return c.json({
        error: "Email already registered"
      }, 400);
    }

    // Create admin user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const userId = nanoid();

    await db.insert(users).values({
      id: userId,
      email,
      password: hashedPassword,
      name,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    return c.json({
      message: "Admin user created successfully",
      data: {
        id: userId,
        email,
        name,
        role: "admin"
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: "Invalid input data",
        details: error.errors
      }, 400);
    }

    console.error("Error creating admin:", error);
    return c.json({
      error: "Internal server error"
    }, 500);
  }
});

// Protect all other routes with authentication and admin check
app.use("*", verifyAuth);
app.use("*", adminAuth);

// Get all bookings with advanced filtering
app.get("/bookings", async (c) => {
  try {
    const query = c.req.query();
    const { 
      page, 
      limit, 
      search, 
      sortBy, 
      sortOrder, 
      status, 
      email,
      startDate, 
      endDate 
    } = querySchema.parse(query);
    
    const db = c.get("db");

    // Build query parts
    const queries: SQL<unknown>[] = [];

    // Add filters
    if (status) {
      queries.push(eq(bookings.paymentStatus, status));
    }

    if (email) {
      queries.push(eq(bookings.email, email));
    }

    if (startDate && endDate) {
      queries.push(sql`date(${bookings.date}) >= date(${startDate})`);
      queries.push(sql`date(${bookings.date}) <= date(${endDate})`);
    }

    if (search) {
      queries.push(
        sql`(${bookings.name} LIKE ${`%${search}%`} OR ${bookings.email} LIKE ${`%${search}%`})`
      );
    }

    // Build where clause
    const whereClause = queries.length > 0 ? and(...queries) : undefined;

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
      .select({
        id: bookings.id,
        name: bookings.name,
        email: bookings.email,
        date: bookings.date,
        paymentStatus: bookings.paymentStatus,
        meetLink: bookings.meetLink,
        createdAt: bookings.createdAt
      })
      .from(bookings)
      .where(whereClause)
      .orderBy(sortFn(sortColumn))
      .limit(limit)
      .offset((page - 1) * limit);

    // Add summary statistics
    const stats = await db
      .select({
        status: bookings.paymentStatus,
        count: sql`count(*)`,
      })
      .from(bookings)
      .groupBy(bookings.paymentStatus);

    // Get daily booking counts for the last 30 days
    const dailyStats = await db
      .select({
        date: sql`date(${bookings.date})`,
        count: sql`count(*)`,
      })
      .from(bookings)
      .where(
        sql`date(${bookings.date}) >= date('now', '-30 days')`
      )
      .groupBy(sql`date(${bookings.date})`)
      .orderBy(asc(sql`date(${bookings.date})`));

    return c.json({
      data: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      stats: {
        byStatus: stats.reduce((acc, curr) => ({
          ...acc,
          [curr.status as string]: curr.count
        }), {}),
        daily: dailyStats
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

// Get a single booking by ID
app.get("/bookings/:id", async (c) => {
  try {
    const bookingId = c.req.param("id");
    const db = c.get("db");

    const booking = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking.length) {
      return c.json({
        error: "Booking not found"
      }, 404);
    }

    return c.json({
      data: booking[0]
    });

  } catch (error) {
    console.error("Error fetching booking:", error);
    return c.json({
      error: "Internal server error"
    }, 500);
  }
});

// Update a booking
app.patch("/bookings/:id", async (c) => {
  try {
    const bookingId = c.req.param("id");
    const body = await c.req.json();
    const { status, meetLink, date } = updateBookingSchema.parse(body);

    const db = c.get("db");

    // Check if booking exists
    const existingBooking = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!existingBooking.length) {
      return c.json({
        error: "Booking not found"
      }, 404);
    }

    // Update booking
    const updateData: Partial<typeof existingBooking[0]> = {
      paymentStatus: status
    };

    if (meetLink) {
      updateData.meetLink = meetLink;
    }

    if (date) {
      updateData.date = date;
    }

    await db
      .update(bookings)
      .set(updateData)
      .where(eq(bookings.id, bookingId));

    // Get updated booking
    const updatedBooking = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    return c.json({
      message: "Booking updated successfully",
      data: updatedBooking[0]
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: "Invalid update data",
        details: error.errors
      }, 400);
    }

    console.error("Error updating booking:", error);
    return c.json({
      error: "Internal server error"
    }, 500);
  }
});

// Delete a booking
app.delete("/bookings/:id", async (c) => {
  try {
    const bookingId = c.req.param("id");
    const db = c.get("db");

    // Check if booking exists
    const existingBooking = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!existingBooking.length) {
      return c.json({
        error: "Booking not found"
      }, 404);
    }

    // Delete booking
    await db
      .delete(bookings)
      .where(eq(bookings.id, bookingId));

    return c.json({
      message: "Booking deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting booking:", error);
    return c.json({
      error: "Internal server error"
    }, 500);
  }
});

// Get booking statistics
app.get("/stats", async (c) => {
  try {
    const db = c.get("db");

    // Get status counts
    const statusStats = await db
      .select({
        status: bookings.paymentStatus,
        count: sql`count(*)`,
      })
      .from(bookings)
      .groupBy(bookings.paymentStatus);

    // Get daily stats for last 30 days
    const dailyStats = await db
      .select({
        date: sql`date(${bookings.date})`,
        count: sql`count(*)`,
        status: bookings.paymentStatus
      })
      .from(bookings)
      .where(
        sql`date(${bookings.date}) >= date('now', '-30 days')`
      )
      .groupBy(sql`date(${bookings.date}), ${bookings.paymentStatus}`)
      .orderBy(asc(sql`date(${bookings.date})`));

    // Get user stats (top users by booking count)
    const userStats = await db
      .select({
        email: bookings.email,
        count: sql`count(*)`,
      })
      .from(bookings)
      .groupBy(bookings.email)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return c.json({
      data: {
        byStatus: statusStats.reduce((acc, curr) => ({
          ...acc,
          [curr.status as string]: curr.count
        }), {}),
        daily: dailyStats,
        topUsers: userStats
      }
    });

  } catch (error) {
    console.error("Error fetching statistics:", error);
    return c.json({
      error: "Internal server error"
    }, 500);
  }
});

// Promote user to admin
app.post("/users/:id/promote", async (c) => {
  try {
    const userId = c.req.param("id");
    const db = c.get("db");

    // Check if user exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!existingUser.length) {
      return c.json({
        error: "User not found"
      }, 404);
    }

    // Update user role to admin
    await db
      .update(users)
      .set({ 
        role: "admin",
        updatedAt: Date.now()
      })
      .where(eq(users.id, userId));

    // Get updated user
    const updatedUser = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return c.json({
      message: "User promoted to admin successfully",
      data: updatedUser[0]
    });

  } catch (error) {
    console.error("Error promoting user:", error);
    return c.json({
      error: "Internal server error"
    }, 500);
  }
});

// Get all users
app.get("/users", async (c) => {
  try {
    const db = c.get("db");

    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return c.json({
      data: allUsers
    });

  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({
      error: "Internal server error"
    }, 500);
  }
});

export default app; 