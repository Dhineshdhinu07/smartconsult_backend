# SmartConsult - Backend

🚀 The backend for the consultation booking system built with **Hono (Cloudflare Workers), Drizzle ORM, Cloudflare D1, and JWT authentication**.

---

## 🛠️ Tech Stack

- **Framework:** Hono (Cloudflare Workers)
- **Database:** Drizzle ORM with Cloudflare D1
- **Authentication:** JWT-based auth
- **Validation:** Zod
- **File Storage:** Cloudflare Storage
- **Payments:** Cashfree API
- **Meetings:** Zoho Meet API

---

## 📈 Installation & Setup

### 1️⃣ Clone the repository
```sh
git clone https://github.com/Dhineshdhinu07/smartconsult_backend.git
cd smartconsult_backend
```

### 2️⃣ Initialize a New Hono Project
```sh
npm init -y
npm install hono zod bcryptjs jsonwebtoken dotenv
```

### 3️⃣ Install Cloudflare Workers CLI (Wrangler)
```sh
npm install -g wrangler
wrangler login
```

### 4️⃣ Install Drizzle ORM & Cloudflare D1 Adapter
```sh
npm install drizzle-orm @cloudflare/workers-types
npm install drizzle-kit
```

### 5️⃣ Set Up Drizzle Configuration
Create `drizzle.config.ts` in the project root:
```ts
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
};
```

### 6️⃣ Define Database Schema
Create `src/db/schema.ts`:
```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  date: text("date").notNull(),
  fileUrl: text("file_url"),
  paymentStatus: text("payment_status").default("pending"),
  meetLink: text("meet_link"),
  createdAt: integer("created_at").default(Date.now),
});
```

### 7️⃣ Run Drizzle Migration
```sh
npx drizzle-kit push
```

### 8️⃣ Create an Environment File (`.env`)
```sh
DATABASE_URL="your-cloudflare-d1-url"
JWT_SECRET="your-secret-key"
CASHFREE_API_KEY="your-api-key"
ZOHO_MEET_API_KEY="your-api-key"
```

### 9️⃣ Start the Development Server
```sh
wrangler dev
```
🔗 **Backend Running at:** `http://127.0.0.1:8787`

---

## 📈 API Endpoints

### **Authentication**
- `POST /auth/register` – Register a new user
- `POST /auth/login` – Login and receive JWT token

### **User Actions**
- `POST /booking` – Book a consultation
- `GET /bookings` – View user bookings
- `PUT /booking/:id` – Edit a booking
- `DELETE /booking/:id` – Delete a booking

### **Admin Actions**
- `GET /admin/bookings` – View all bookings
- `PUT /admin/booking/:id` – Update booking status
- `DELETE /admin/booking/:id` – Delete a booking

---

## ✅ Testing
To test API endpoints:
```sh
npx wrangler dev
```

---

## 🚀 Deployment

To deploy to Cloudflare Workers:
```sh
wrangler publish
```
This will deploy the backend to **Cloudflare Workers**.

---

## 📈 Features

- 📝 **User Authentication** (JWT-based login/register)
- 📅 **Consultation Booking** (File upload + Payment)
- 🔎 **Search, Filter, and Pagination** (Bookings List)
- ⚡ **Admin Dashboard** (Manage bookings, edit, delete)
- 💳 **Payment Processing** (Cashfree API)
- 🎥 **Meeting Integration** (Zoho Meet API)
- 🌚 **Dark Mode Toggle** (Optional)

---

## 🛠️ Troubleshooting

🤔 **Database connection issues?**  
Check `.env` file and ensure `DATABASE_URL` is correctly set.

🤔 **Wrangler not working?**  
Try reinstalling:
```sh
npm install -g wrangler
```

🤔 **Drizzle migration errors?**  
Try running:
```sh
npx drizzle-kit push --force
```

---

## 📄 Contributions
1. Fork the repo
2. Create a new branch (`git checkout -b feature-branch`)
3. Commit your changes (`git commit -m "Added new feature"`)
4. Push to GitHub (`git push origin feature-branch`)
5. Open a **Pull Request**

---
