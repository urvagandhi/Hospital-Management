# 🧪 API Testing Guide

Complete guide to test all authentication endpoints with real requests.

---

## 📌 Base URL

```
http://localhost:5000
```

---

## 1️⃣ **Login Endpoint**

### Request

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@citymedical.com",
    "password": "Password123"
  }'
```

### Successful Response (200)

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY1NTdmZjJjMzQ1NjdhZWY4OTBhMjM0NSIsInR5cGUiOiJ0ZW1wIiwiaWF0IjoxNzAwMDA5NzQ0LCJleHAiOjE3MDAwMTMzNDR9.qwerty...",
    "phone": "+91XXXXX1234",
    "expiresAt": "2025-11-15T10:30:00.000Z",
    "hospitalName": "City Medical Center",
    "logoUrl": "https://via.placeholder.com/150?text=City+Medical"
  }
}
```

### Error Response (401)

```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

---

## 2️⃣ **Resend OTP Endpoint**

### Request

```bash
curl -X POST http://localhost:5000/api/auth/resend-otp \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

### Successful Response (200)

```json
{
  "success": true,
  "message": "OTP resent successfully",
  "data": {
    "phone": "+91XXXXX1234",
    "expiresAt": "2025-11-15T10:35:00.000Z"
  }
}
```

---

## 3️⃣ **Verify OTP Endpoint**

### Request

```bash
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "otp": "123456"
  }'
```

**Note**: Replace with actual OTP from backend console (dev mode) or SMS

### Successful Response (200)

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY1NTdmZjJjMzQ1NjdhZWY4OTBhMjM0NSIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3MDAwMDk3NDQsImV4cCI6MTcwMDA5NjE0NH0.wxyz...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY1NTdmZjJjMzQ1NjdhZWY4OTBhMjM0NSIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNzAwMDA5NzQ0LCJleHAiOjE3MDA2MTQ1NDR9.abcd...",
    "tokenType": "Bearer",
    "expiresIn": "24h",
    "hospital": {
      "_id": "6557ff2c34567aef890a2345",
      "hospitalName": "City Medical Center",
      "email": "admin@citymedical.com",
      "phone": "+919876543210",
      "logoUrl": "https://via.placeholder.com/150?text=City+Medical",
      "isActive": true,
      "department": "General",
      "address": "123 Medical Lane",
      "city": "Mumbai",
      "state": "Maharashtra",
      "zipCode": "400001"
    }
  }
}
```

### Error Response (400)

```json
{
  "success": false,
  "message": "Invalid OTP"
}
```

---

## 4️⃣ **Refresh Token Endpoint**

### Request

```bash
curl -X POST http://localhost:5000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY1NTdmZjJjMzQ1NjdhZWY4OTBhMjM0NSIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNzAwMDA5NzQ0LCJleHAiOjE3MDA2MTQ1NDR9.abcd..."
  }'
```

### Successful Response (200)

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY1NTdmZjJjMzQ1NjdhZWY4OTBhMjM0NSIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3MDAwMTAzNDQsImV4cCI6MTcwMDA5Njc0NH0.new_token...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY1NTdmZjJjMzQ1NjdhZWY4OTBhMjM0NSIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNzAwMDA5NzQ0LCJleHAiOjE3MDA2MTQ1NDR9.abcd...",
    "tokenType": "Bearer",
    "expiresIn": "24h"
  }
}
```

---

## 5️⃣ **Logout Endpoint**

### Request

```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY1NTdmZjJjMzQ1NjdhZWY4OTBhMjM0NSIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNzAwMDA5NzQ0LCJleHAiOjE3MDA2MTQ1NDR9.abcd..."
  }'
```

### Successful Response (200)

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 🧪 **Testing Workflow**

### Step 1: Login

```bash
# Save response tempToken for next step
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@citymedical.com",
    "password": "Password123"
  }' | jq '.data.tempToken'
```

### Step 2: Check OTP in Console

```
[DEV] OTP for +919876543210: 123456
```

### Step 3: Verify OTP

```bash
# Replace TEMP_TOKEN with value from Step 1
# Replace OTP with value from Step 2
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Authorization: Bearer TEMP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "otp": "123456"
  }' | jq '.data | {accessToken, refreshToken}'
```

### Step 4: Use Access Token

```bash
curl -X POST http://localhost:5000/api/auth/refresh-token \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "REFRESH_TOKEN"
  }'
```

### Step 5: Logout

```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "REFRESH_TOKEN"
  }'
```

---

## 📊 **Error Codes**

| Code | Message                   | Cause                         |
| ---- | ------------------------- | ----------------------------- |
| 400  | Validation failed         | Invalid email/password format |
| 401  | Invalid email or password | Credentials don't match       |
| 401  | Unauthorized              | Missing or invalid token      |
| 401  | Invalid OTP               | Wrong 6-digit code            |
| 429  | Too many requests         | Rate limit exceeded           |
| 500  | Internal Server Error     | Server error                  |

---

## 🔒 **Test With Different Users**

### City Medical Center

- Email: `admin@citymedical.com`
- Password: `Password123`

### Green Valley Hospital

- Email: `admin@greenvalley.com`
- Password: `Password123`

### Royal Care Hospital

- Email: `admin@royalcare.com`
- Password: `Password123`

---

## 🛠 **Tools for Testing**

### Using Postman

1. Import the endpoints as collection
2. Set base URL: `http://localhost:5000`
3. Set environment variables for tokens
4. Test each endpoint sequentially

### Using cURL

```bash
# Save in test.sh
#!/bin/bash

# Login
RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@citymedical.com",
    "password": "Password123"
  }')

TEMP_TOKEN=$(echo $RESPONSE | jq -r '.data.tempToken')
echo "Temp Token: $TEMP_TOKEN"

# Resend OTP
curl -s -X POST http://localhost:5000/api/auth/resend-otp \
  -H "Authorization: Bearer $TEMP_TOKEN" \
  -H "Content-Type: application/json" | jq '.'
```

### Using REST Client (VS Code Extension)

```http
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "admin@citymedical.com",
  "password": "Password123"
}

###

POST http://localhost:5000/api/auth/verify-otp
Authorization: Bearer <TEMP_TOKEN>
Content-Type: application/json

{
  "otp": "123456"
}
```

---

## 📈 **Load Testing**

### Test Rate Limiting

```bash
# Should fail after 5 attempts in 15 minutes
for i in {1..6}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "admin@citymedical.com",
      "password": "WrongPassword"
    }'
  echo "Attempt $i"
done
```

### Expected Response (after limit)

```json
{
  "success": false,
  "message": "Too many requests from this IP, please try again later."
}
```

---

## ✅ **Validation Tests**

### Invalid Email Format

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalid-email",
    "password": "Password123"
  }'
```

### Short Password

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@citymedical.com",
    "password": "123"
  }'
```

### Invalid OTP Format

```bash
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "otp": "12345"
  }'
```

---

## 🎯 **Integration Testing Checklist**

- [ ] Login with correct credentials succeeds
- [ ] Login with wrong password fails
- [ ] Login with non-existent email fails
- [ ] OTP sent successfully after login
- [ ] OTP verification with correct code succeeds
- [ ] OTP verification with wrong code fails
- [ ] OTP expires after 5 minutes
- [ ] Max 3 OTP attempts enforced
- [ ] Refresh token generates new access token
- [ ] Logout invalidates session
- [ ] Rate limiting works on login
- [ ] Rate limiting works on OTP
- [ ] CORS allowed for frontend
- [ ] Security headers present

---

**Happy Testing!** 🧪
