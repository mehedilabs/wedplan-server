# WedPlan — Backend API

The backend service powering WedPlan, a wedding planning platform that connects customers, vendors, and administrators.

Built with Express.js, TypeScript, and MongoDB, the backend handles application data, service management, booking workflows, authentication verification, image uploads, and subscription payments.

<p align="center">
  <a href="https://wedplan-mehedilabs.vercel.app">Live Application</a> •
  <a href="https://github.com/mehedilabs/wedplan-client">Frontend Repository</a>
</p>

---

## Overview

The WedPlan backend provides the API layer for the frontend application.

It manages the core business operations of the platform, including:

- User authentication verification.
- Service creation and management.
- Booking request management.
- User and service administration.
- Subscription payment processing.
- Transaction handling.
- Image uploads.

The application uses MongoDB for persistent data storage and integrates with external services for authentication, payments, and image hosting.

## Core Features

### Authentication & Authorization

- Authentication verification using Better Auth.
- Protected API routes.
- User role verification.
- Role-based access control.
- Vendor ownership verification for service operations.

### Service Management

- Create and manage wedding services.
- Update and delete services.
- Retrieve service information.
- Manage service approval status.
- Associate services with their vendors.

### Booking Management

- Create customer booking requests.
- Retrieve booking information.
- Manage booking statuses.
- Accept or reject booking requests.
- Cancel eligible booking requests.
- Prevent duplicate active booking requests.
- Prevent vendors from booking their own services.

### Administration

- Retrieve platform overview information.
- Manage user accounts.
- Manage submitted services.
- Review service approval requests.
- Retrieve transaction information.

### Subscription & Payment

- Stripe payment integration.
- Premium subscription checkout.
- Stripe webhook handling.
- Payment verification.
- Subscription activation after successful payment.
- Transaction records.

### Image Upload

- ImgBB integration for image hosting.
- Image upload utility.

## Technology Stack

| Category                    | Technologies |
| --------------------------- | ------------ |
| Runtime                     | Node.js      |
| Framework                   | Express.js   |
| Language                    | TypeScript   |
| Database                    | MongoDB      |
| Authentication              | Better Auth  |
| Authentication Verification | JOSE         |
| Payment Gateway             | Stripe       |
| Image Hosting               | ImgBB        |
| Deployment                  | Vercel       |

## Project Architecture

The backend uses a modular structure to separate application responsibilities.

```text
src/
├── config/
│   ├── db.ts
│   └── stripe.ts
├── middlewares/
│   └── auth.ts
├── routes/
│   └── ...
├── utils/
│   ├── imageUpload.ts
│   └── verifyVendor.ts
└── server.ts
```

**Main responsibilities:**

- `config/` — Database and external service configuration.
- `middlewares/` — Request authentication and authorization.
- `routes/` — API route handling and business operations.
- `utils/` — Reusable utilities for image uploads and vendor verification.
- `server.ts` — Express application setup and server configuration.

## Getting Started

### Prerequisites

Make sure you have:

- Node.js (LTS recommended)
- npm
- MongoDB database
- Stripe account and API credentials
- ImgBB API key
- A configured WedPlan frontend

### 1. Clone the Repository

```bash
git clone https://github.com/mehedilabs/wedplan-server.git
cd wedplan-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root.

```env
# Server
PORT=5000
CLIENT_URL=http://localhost:3000

# MongoDB
MONGODB_URI=your_mongodb_connection_string
DB_NAME=your_database_name

# Authentication
BETTER_AUTH_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PREMIUM_PRICE_ID=your_stripe_price_id
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Image Upload
IMGBB_API_KEY=your_imgbb_api_key
```

Replace all placeholder values with your own credentials.

Never commit `.env` files, private API keys, payment secrets, or webhook secrets to version control.

### 4. Run the Development Server

```bash
npm run dev
```

The backend uses port `5000` by default when running outside production, unless another port is configured.

**Local API base URL:**

```text
http://localhost:5000
```

## Environment Variables

| Variable                  | Purpose                       |
| ------------------------- | ----------------------------- |
| `PORT`                    | Backend server port           |
| `CLIENT_URL`              | Frontend application URL      |
| `MONGODB_URI`             | MongoDB connection string     |
| `DB_NAME`                 | MongoDB database name         |
| `BETTER_AUTH_URL`         | Better Auth base URL          |
| `STRIPE_SECRET_KEY`       | Stripe private API key        |
| `STRIPE_PREMIUM_PRICE_ID` | Premium subscription price ID |
| `STRIPE_WEBHOOK_SECRET`   | Stripe webhook signing secret |
| `IMGBB_API_KEY`           | ImgBB API key                 |

## External Services

### MongoDB

Used for storing application data, including services, bookings, transactions, and related records.

### Better Auth

Provides authentication infrastructure used by the frontend. The backend verifies authenticated requests.

### Stripe

Handles premium subscription payments and webhook-based payment event processing.

### ImgBB

Provides external image hosting for uploaded images.

## Frontend Integration

The backend is designed to work with the WedPlan Next.js frontend.

**Frontend Repository:**  
https://github.com/mehedilabs/wedplan-client

**Live Application:**  
https://wedplan-mehedilabs.vercel.app

Make sure the frontend API URL and backend client URL are configured correctly for local development and production.

## Deployment

The backend is deployed on Vercel.

For production deployment:

- Configure all required environment variables.
- Use the production MongoDB connection.
- Configure the production frontend URL.
- Set up Stripe production credentials and webhook configuration.
- Keep all private credentials secure.

---

<p align="center">
  Backend services for the WedPlan wedding planning platform.
</p>
