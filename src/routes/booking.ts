import { Hono } from "hono";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { bookings } from "../schema/booking";
import { eq } from "drizzle-orm";

// Zod schema for booking validation
const bookingSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Invalid date format. Use YYYY-MM-DDTHH:mm"),
  amount: z.number().positive("Amount must be positive")
});

const app = new Hono();

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
    await db.insert(bookings).values({
      id: bookingId,
      name: validatedData.name,
      email: validatedData.email,
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

export default app; 