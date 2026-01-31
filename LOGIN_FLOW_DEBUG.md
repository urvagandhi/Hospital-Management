# Hospital Management - Login Flow Debugging Guide

## Complete Authentication Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User enters email & password on /login                  │
│     ↓                                                        │
│  2. Click "Sign In" button → handleSubmit()                 │
│     ↓                                                        │
│  3. Validate form (email, password format)                  │
│     ↓                                                        │
│  4. Call authService.login(email, password)                 │
│     ↓                                                        │
│  5. POST /api/auth/login with credentials                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                           ↓ (HTTP)
┌──────────────────────────────────────────────────────────────┐
│                    BACKEND (Express)                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  6. Route: POST /api/auth/login (authLimiter → validate)   │
│     ↓                                                        │
│  7. Controller: auth.controller.login()                     │
│     ├─ Find hospital by email                              │
│     ├─ Compare password hash                               │
│     ├─ Create OTP (5-min TTL)                              │
│     ├─ Send OTP via SMS (logs to console in dev)           │
│     └─ Generate tempToken (10-min JWT)                     │
│     ↓                                                        │
│  8. Response: { tempToken, phone, expiresAt, ... }         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                           ↓ (HTTP 200)
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  9. Store tempToken in localStorage                         │
│     ↓                                                        │
│  10. Navigate to /verify-otp                                │
│      ↓                                                       │
│  11. User enters 6-digit OTP                                │
│      ↓                                                       │
│  12. Call authService.verifyOtp(otp)                        │
│      ├─ Attach tempToken in Authorization header           │
│      └─ POST /api/auth/verify-otp                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                           ↓ (HTTP)
┌──────────────────────────────────────────────────────────────┐
│                    BACKEND (Express)                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  13. Route: POST /api/auth/verify-otp                       │
│      (otpLimiter → verifyTempToken → validate)             │
│      ↓                                                       │
│  14. verifyTempToken middleware:                            │
│      ├─ Extract Authorization header                        │
│      ├─ Verify JWT (type === "temp")                       │
│      ├─ Extract hospitalId from token                       │
│      └─ Attach to req.hospital.id                          │
│      ↓                                                       │
│  15. Controller: auth.controller.verifyOtp()                │
│      ├─ Verify OTP against database                         │
│      ├─ Create session (with refresh token)                 │
│      ├─ Generate access token (24h)                         │
│      └─ Return tokens + hospital data                       │
│      ↓                                                       │
│  16. Response: { accessToken, refreshToken, hospital }      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                           ↓ (HTTP 200)
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  17. Store accessToken + refreshToken in localStorage       │
│      ↓                                                       │
│  18. Store hospital data in localStorage                    │
│      ↓                                                       │
│  19. Update auth context state (isAuthenticated = true)     │
│      ↓                                                       │
│  20. Navigate to /dashboard                                 │
│      ↓                                                       │
│  21. ProtectedRoute checks isAuthenticated (true)           │
│      ↓                                                       │
│  22. Dashboard renders with hospital info                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Testing

### 1. Verify Backend is Running

```powershell
# Check if backend server started successfully
# You should see:
# ✓ MongoDB connected: ...
# ✓ Server running on port 5000
# ✓ Environment: development
```

**Symptoms of failure:**

- `MongoDB connection error: connect ECONNREFUSED` → MongoDB/Atlas is down or URI is invalid
- `Cannot find module` → Missing npm dependencies
- Port already in use → Another process on 5000

---

### 2. Test Login Endpoint (Without OTP)

Using PowerShell/curl:

```powershell
$email = "admin@citymedical.com"
$password = "Password123"
$body = @{
    email = $email
    password = $password
} | ConvertTo-Json

curl -X POST `
  -H "Content-Type: application/json" `
  -d $body `
  http://localhost:5000/api/auth/login
```

**Expected response (200 OK):**

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "tempToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "phone": "+91 XXXXX1234",
    "expiresAt": "2025-11-15T08:30:00Z",
    "hospitalName": "City Medical Center",
    "logoUrl": "https://..."
  }
}
```

**If not 200:**

| Status | Cause                             | Fix                                        |
| ------ | --------------------------------- | ------------------------------------------ |
| 401    | Email or password invalid         | Check demo credentials exist in database   |
| 400    | Email/password format error       | Validate input format                      |
| 500    | Server error (check backend logs) | See backend console output                 |
| 404    | Route not found                   | Confirm backend route is `/api/auth/login` |

**To check database:**

```powershell
# Connect to MongoDB Atlas and verify hospital record exists
# Use MongoDB Compass or mongosh with your Atlas connection string
```

---

### 3. Seed Database (If No Hospitals)

If test endpoint returned 401 (user not found), seed the database:

```powershell
cd D:\Project\Hospital-Management\backend
node scripts/seed.js
```

**Expected output:**

```
✓ Hospital 1 created: City Medical Center
✓ Hospital 2 created: Green Valley Hospital
✓ Hospital 3 created: Royal Care Hospital
```

Then retry login test above.

---

### 4. Test OTP Verification

Using the tempToken from Step 2:

```powershell
# Replace TEMP_TOKEN with value from previous response
$tempToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
$otp = "123456"  # Use OTP shown in backend console

$body = @{ otp = $otp } | ConvertTo-Json

curl -X POST `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $tempToken" `
  -d $body `
  http://localhost:5000/api/auth/verify-otp
```

**Expected response (200 OK):**

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "hospital": { "_id": "...", "email": "..." }
  }
}
```

---

## Frontend Debugging Checklist

### Console Logs to Check

Open browser **DevTools → Console** and attempt login. You should see:

1. ✅ `Login form submitted { email: "...", password: "..." }`
2. ✅ `authService.login called { email: "..." }`
3. ✅ Network request shown in **Network** tab as **POST /api/auth/login**
4. ✅ Response status **200** with **tempToken** in body

### If Logs Are Missing

| Missing Log                   | Cause                                       | Fix                                                      |
| ----------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| No "Login form submitted"     | Button not connected or form not submitting | Check form onSubmit handler; verify button type="submit" |
| No "authService.login called" | Validation fails silently                   | Check form validation logic                              |
| No network request            | API call not executed                       | Check browser console for JS errors                      |
| 404 or 500 response           | Backend issue                               | Check backend logs; test curl endpoint                   |

### Network Tab (F12 → Network)

After clicking "Sign In":

- **Request URL:** `http://localhost:5000/api/auth/login` (or `http://localhost:3001/api/auth/login` if frontend on 3001)
- **Method:** POST
- **Headers:** Content-Type: application/json
- **Body:** `{ "email": "admin@citymedical.com", "password": "Password123" }`
- **Response Status:** 200
- **Response Body:** Contains `tempToken` field

---

## Common Issues & Fixes

### Issue 1: Frontend Request Not Appearing in Network Tab

**Symptoms:** Click Sign In, no network request visible.

**Causes & Fixes:**

1. **Form validation blocks request**

   - Check browser console for validation error messages
   - Verify email/password format is correct
   - Try demo: `admin@citymedical.com` / `Password123`

2. **JavaScript error before API call**

   - Open DevTools → Console
   - Look for red error messages
   - Check if `authService.login` is defined
   - Verify `api.post` method exists

3. **CORS issue (preflight failed)**

   - Check Network tab for OPTIONS request
   - Verify backend CORS middleware is configured
   - Confirm `FRONTEND_URL` in backend .env matches frontend URL

4. **Axios interceptor issue**
   - Check if request interceptor is running (add logs)
   - Verify `api` instance is initialized properly

**Debug with:**

```javascript
// In browser console
console.log(localStorage.getItem("tempToken")); // Should be null on login page
console.log(import("authService")); // Verify import works
```

---

### Issue 2: Backend Returns 401 (Invalid Credentials)

**Symptoms:** Network tab shows 401 response.

**Causes & Fixes:**

1. **Hospital record not in database**

   - Run: `node scripts/seed.js`
   - Verify in MongoDB: `db.hospitals.findOne({ email: "admin@citymedical.com" })`

2. **Password doesn't match**

   - Seed script creates: Password123
   - Verify you're using exact case-sensitive password
   - Try: `admin@citymedical.com` / `Password123`

3. **Email not found**
   - Check MongoDB for case sensitivity
   - Backend normalizes to lowercase: `email.toLowerCase()`

---

### Issue 3: Backend Returns 404

**Symptoms:** Network tab shows 404.

**Causes & Fixes:**

1. **Wrong route prefix**

   - Backend mounts at: `/api/auth`
   - Frontend should POST to: `/api/auth/login` (not `/auth/login`)
   - Check frontend `constants.ts`: `API_URL` should be `http://localhost:5000/api`

2. **Backend not running**
   - Start: `npm run dev` in backend folder
   - Verify console shows "✓ Server running on port 5000"

---

## Complete Test Sequence

Run these in order:

```powershell
# Terminal 1: Backend
cd D:\Project\Hospital-Management\backend
npm run dev
# Wait for: "✓ Server running on port 5000"

# Terminal 2: Database seeding (new terminal)
cd D:\Project\Hospital-Management\backend
node scripts/seed.js
# Wait for success messages

# Terminal 3: Frontend
cd D:\Project\Hospital-Management\frontend
npm run dev
# Wait for: "➜ Local: http://localhost:3000"

# Browser: Open http://localhost:3000
# 1. Try login with: admin@citymedical.com / Password123
# 2. Check console logs and Network tab
# 3. If login succeeds, enter OTP (shown in backend console)
# 4. Verify redirect to /dashboard
```

---

## Support Info

If still stuck, provide:

1. **Backend console output** (first 50 lines after npm run dev)
2. **Browser console** (DevTools → Console after clicking Sign In)
3. **Network tab** (POST /api/auth/login response status and body)
4. **MongoDB status** (can you connect to Atlas?)

Include all three and I'll diagnose the exact block.
