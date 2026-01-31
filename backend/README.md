# Hospital Management Backend API

## Overview

Production-ready backend for Hospital Management System with Login + 2FA OTP Verification.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB + Mongoose
- **Authentication**: JWT + OTP
- **Security**: bcryptjs, helmet, CORS, rate-limiting

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── db.js        # MongoDB connection
│   │   └── env.js       # Environment variables
│   ├── models/          # Mongoose schemas
│   │   ├── Hospital.js
│   │   ├── Otp.js
│   │   └── Session.js
│   ├── controllers/     # Request handlers
│   │   └── auth.controller.js
│   ├── routes/          # API routes
│   │   └── auth.routes.js
│   ├── services/        # Business logic
│   │   ├── otp.service.js
│   │   ├── sms.service.js
│   │   └── token.service.js
│   ├── middleware/      # Express middleware
│   │   ├── auth.js      # JWT verification
│   │   ├── validateRequest.js
│   │   ├── rateLimiter.js
│   │   └── errorHandler.js
│   ├── utils/           # Utility functions
│   │   ├── generateOtp.js
│   │   ├── hash.js      # bcrypt functions
│   │   └── jwt.js       # JWT utilities
│   ├── __tests__/       # Test files
│   └── index.js         # Entry point
├── package.json
├── .env.example
└── README.md
```

## Installation

### Prerequisites

- Node.js v16+
- MongoDB v4.4+
- npm or yarn

### Steps

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Setup environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:

   ```
   MONGODB_URI=mongodb://localhost:27017/hospital-management
   PORT=5000
   JWT_SECRET=your_secret_key
   REFRESH_TOKEN_SECRET=your_refresh_secret
   FRONTEND_URL=http://localhost:3000
   ```

3. **Start MongoDB**

   ```bash
   mongod
   ```

4. **Run development server**

   ```bash
   npm run dev
   ```

5. **Run tests**
   ```bash
   npm test
   ```

## API Endpoints

### Authentication

#### 1. Login

**POST** `/api/auth/login`

Request body:

```json
{
  "email": "hospital@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "tempToken": "jwt_token_here",
    "phone": "+91XXXXX1234",
    "expiresAt": "2025-11-15T10:30:00Z",
    "hospitalName": "City Hospital",
    "logoUrl": "https://..."
  }
}
```

#### 2. Verify OTP

**POST** `/api/auth/verify-otp`

Headers:

```
Authorization: Bearer <tempToken>
```

Request body:

```json
{
  "otp": "123456"
}
```

Response:

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "accessToken": "jwt_token",
    "refreshToken": "refresh_token",
    "tokenType": "Bearer",
    "expiresIn": "24h",
    "hospital": {
      "_id": "...",
      "hospitalName": "...",
      "email": "...",
      "phone": "..."
    }
  }
}
```

#### 3. Refresh Token

**POST** `/api/auth/refresh-token`

Request body:

```json
{
  "refreshToken": "refresh_token_here"
}
```

Response:

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "new_jwt_token",
    "refreshToken": "refresh_token",
    "tokenType": "Bearer",
    "expiresIn": "24h"
  }
}
```

#### 4. Logout

**POST** `/api/auth/logout`

Request body:

```json
{
  "refreshToken": "refresh_token_here"
}
```

Response:

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### 5. Resend OTP

**POST** `/api/auth/resend-otp`

Headers:

```
Authorization: Bearer <tempToken>
```

Response:

```json
{
  "success": true,
  "message": "OTP resent successfully",
  "data": {
    "phone": "+91XXXXX1234",
    "expiresAt": "2025-11-15T10:35:00Z"
  }
}
```

## Security Features

✅ **Password Hashing**: bcryptjs with 10 salt rounds
✅ **JWT Tokens**: Separate access and refresh tokens
✅ **OTP Hashing**: Secure OTP storage with TTL expiry
✅ **Rate Limiting**: Brute force attack prevention
✅ **CORS**: Configured for frontend URL
✅ **Helmet**: Security headers
✅ **Input Validation**: express-validator
✅ **Single Device Login**: Device fingerprinting
✅ **Error Handling**: Centralized error middleware

## Database Models

### Hospital

```javascript
{
  hospitalName: String,
  email: String (unique),
  phone: String (unique),
  passwordHash: String,
  logoUrl: String,
  isActive: Boolean,
  department: String,
  address: String,
  city: String,
  state: String,
  zipCode: String,
  createdAt: Date,
  updatedAt: Date
}
```

### OTP

```javascript
{
  hospitalId: ObjectId (ref: Hospital),
  otpHash: String,
  expiresAt: Date (TTL: 5 min),
  attemptsCount: Number (max: 3),
  isUsed: Boolean,
  ipAddress: String,
  userAgent: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Session

```javascript
{
  hospitalId: ObjectId (ref: Hospital),
  refreshToken: String (unique),
  deviceId: String,
  ipAddress: String,
  userAgent: String,
  expiresAt: Date (TTL: 7 days),
  isActive: Boolean,
  lastAccessedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## Error Codes

| Code | Message                          |
| ---- | -------------------------------- |
| 400  | Validation Error                 |
| 401  | Unauthorized / Invalid Token     |
| 403  | Forbidden / Inactive Account     |
| 404  | Not Found                        |
| 429  | Too Many Requests (Rate Limited) |
| 500  | Internal Server Error            |

## Development

### Running in Development Mode

```bash
npm run dev
```

Uses nodemon for auto-reload on file changes.

### Running in Production

```bash
NODE_ENV=production npm start
```

### Running Tests

```bash
npm test
```

## Configuration

### Rate Limiting

- **General API**: 10 requests per 15 seconds
- **Login Endpoint**: 5 attempts per 15 minutes
- **OTP Endpoint**: 3 attempts per 60 seconds

### OTP Settings

- **Length**: 6 digits
- **Expiry**: 5 minutes
- **Max Attempts**: 3
- **Auto-cleanup**: MongoDB TTL index

### JWT Expiry

- **Access Token**: 24 hours
- **Refresh Token**: 7 days
- **Temp Token**: 10 minutes

## Testing

### API Testing Tools

- **Postman**: Import API collection from `postman.json`
- **cURL**: See examples below
- **Jest**: Run `npm test`

### Sample cURL Requests

**Login:**

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "hospital@example.com",
    "password": "password123"
  }'
```

**Verify OTP:**

```bash
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <tempToken>" \
  -d '{
    "otp": "123456"
  }'
```

## Troubleshooting

### MongoDB Connection Failed

- Ensure MongoDB is running
- Check `MONGODB_URI` in `.env`
- Verify network connectivity

### OTP Not Received

- Check SMS gateway configuration
- In development, OTP is logged to console
- Check `SMS_GATEWAY_API_KEY` in `.env`

### Token Expired

- Use refresh token to get new access token
- Refresh tokens expire after 7 days

## Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "Add feature"`
3. Push to branch: `git push origin feature/your-feature`
4. Open pull request

## License

MIT License - See LICENSE file
