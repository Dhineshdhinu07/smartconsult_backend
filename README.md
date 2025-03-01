# SmartConsult Backend API

A robust backend API for SmartConsult, built with Cloudflare Workers, Hono, and D1 Database. This API provides authentication, booking management, and administrative features.

## 🚀 Features

- 🔐 JWT-based Authentication
- 👥 User Management (Registration & Login)
- 📅 Booking System
- 🔑 Admin Dashboard
- 📊 Booking Statistics
- 📝 OpenAPI/Swagger Documentation
- 🎯 Input Validation with Zod
- 🔄 Error Handling
- 🗄️ D1 Database Integration

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Wrangler CLI (`npm install -g wrangler`)
- A Cloudflare account

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/smartconsult_backend.git
cd smartconsult_backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.dev.vars` file in the project root with the following environment variables:
```env
JWT_SECRET=your_jwt_secret_here
ADMIN_SETUP_KEY=your_admin_setup_key_here
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

4. Initialize the D1 database:
```bash
wrangler d1 create smartconsult-db
wrangler d1 execute smartconsult-db --file=./schema.sql
```

## 🚀 Development

Start the development server:
```bash
wrangler dev --persist-to .wrangler/state
```

The API will be available at `Local host-since it is not deployed`

## 📚 API Documentation

Access the Swagger UI documentation at: `localhost/docs`
OpenAPI JSON specification: `localhost/openapi.json`

## 🔑 Authentication

### First Admin Setup
```bash
curl -X POST localhost/admin/setup/first-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@123",
    "name": "Admin User",
    "secretKey": "your_admin_setup_key_here"
  }'
```

### User Registration
```bash
curl -X POST localhost/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "User@123",
    "name": "Test User"
  }'
```

### User Login
```bash
curl -X POST localhost/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "User@123"
  }'
```

## 📅 Booking Endpoints

### Create Booking
```bash
curl -X POST localhost/api/booking \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Booking",
    "date": "2024-03-25T14:30",
    "amount": 1000
  }'
```

### List User's Bookings
```bash
curl -X GET localhost/api/bookings \
  -H "Authorization: Bearer your_token_here"
```

## 👑 Admin Endpoints

### List All Bookings
```bash
curl -X GET "localhost/admin/bookings?page=1&limit=10" \
  -H "Authorization: Bearer admin_token_here"
```

### Get Booking Statistics
```bash
curl -X GET localhost/admin/stats \
  -H "Authorization: Bearer admin_token_here"
```

### Update Booking
```bash
  curl -X PATCH localhost/admin/bookings/{bookingId} \
  -H "Authorization: Bearer admin_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "success",
    "meetLink": "https://meet.example.com/123"
  }'
```

## 🏗️ Project Structure

```
smartconsult_backend/
├── src/
│   ├── index.ts           # Application entry point
│   ├── schema/           # Database schema definitions
│   ├── routes/           # API route handlers
│   ├── middleware/       # Custom middleware
│   └── utils/           # Utility functions
├── .dev.vars            # Development environment variables
├── wrangler.toml        # Wrangler configuration
└── package.json         # Project dependencies
```

## 🔒 Security Features

- Password hashing with bcrypt
- JWT-based authentication
- Input validation with Zod
- Role-based access control
- Environment variable management
- Error handling with proper status codes

## 🧪 Error Handling

The API uses a standardized error response format:
```json
{
  "error": "Error message",
  "details": "Additional error details (development only)",
  "code": "ERROR_CODE"
}
```

## 📦 Dependencies

- `hono`: Web framework
- `@hono/zod-validator`: Input validation
- `drizzle-orm`: SQL toolkit
- `bcryptjs`: Password hashing
- `nanoid`: ID generation
- `zod`: Schema validation
- `@hono/swagger-ui`: API documentation

## 🚀 Deployment

1. Configure your Cloudflare account:
```bash
wrangler login
```

2. Update `wrangler.toml` with your production settings

3. Deploy to Cloudflare Workers:
```bash
wrangler publish
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

