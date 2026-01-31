# 🚀 Quick Start Guide

## Installation & Running

### 1️⃣ **Install Dependencies**

**Backend:**

```bash
cd backend
npm install
```

**Frontend:**

```bash
cd frontend
npm install
```

### 2️⃣ **Environment Setup**

**Backend** - Create `.env` file:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```
MONGODB_URI=mongodb://localhost:27017/hospital-management
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRY=24h
REFRESH_TOKEN_SECRET=your-refresh-secret
REFRESH_TOKEN_EXPIRY=7d
OTP_EXPIRY_MINUTES=5
FRONTEND_URL=http://localhost:3000
```

**Frontend** - Create `.env` file:

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:

```
VITE_API_URL=http://localhost:5000
VITE_APP_NAME="Hospital Management"
```

### 3️⃣ **Start MongoDB**

```bash
# If MongoDB is installed locally
mongod

# Or use MongoDB Atlas cloud connection in .env
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/hospital
```

### 4️⃣ **Start Backend Server**

```bash
cd backend
npm run dev
```

✅ Backend running at `http://localhost:5000`

### 5️⃣ **Start Frontend (New Terminal)**

```bash
cd frontend
npm run dev
```

✅ Frontend running at `http://localhost:3000`

### 6️⃣ **Seed Database (Optional)**

```bash
cd backend
node scripts/seed.js
```

Creates 3 sample hospitals with credentials:

- `admin@citymedical.com` / `Password123`
- `admin@greenvalley.com` / `Password123`
- `admin@royalcare.com` / `Password123`

---

## 🧪 Testing the Application

### Login Flow

1. Open browser → `http://localhost:3000/login`
2. Enter credentials:
   - Email: `admin@citymedical.com`
   - Password: `Password123`
3. Click "Sign In"
4. ✅ OTP sent (check console/terminal in dev mode)

### OTP Verification

1. Frontend shows OTP verification page
2. In development mode, OTP is logged to backend console
3. Enter 6-digit OTP in the input boxes
4. ✅ Auto-verifies on complete OTP entry
5. ✅ Redirects to dashboard on success

### Dashboard

1. Shows authenticated user info
2. Displays hospital details
3. Session info (2FA verified, token status)
4. "Logout" button to exit

---

## 📝 Demo Credentials

```
Hospital 1: City Medical Center
Email: admin@citymedical.com
Password: Password123

Hospital 2: Green Valley Hospital
Email: admin@greenvalley.com
Password: Password123

Hospital 3: Royal Care Hospital
Email: admin@royalcare.com
Password: Password123
```

---

## 🐛 Troubleshooting

### MongoDB Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:27017
```

**Solution:**

- Start MongoDB: `mongod`
- Or update `MONGODB_URI` to MongoDB Atlas connection

### CORS Error

```
Access to XMLHttpRequest blocked by CORS policy
```

**Solution:**

- Verify `VITE_API_URL` in frontend `.env` = `http://localhost:5000`
- Verify `FRONTEND_URL` in backend `.env` = `http://localhost:3000`

### Port Already in Use

```
Error: listen EADDRINUSE :::5000
```

**Solution:**

- Change port in `backend/.env`: `PORT=5001`
- Or kill process: `lsof -ti:5000 | xargs kill -9`

### React Module Not Found

```
Cannot find module 'react'
```

**Solution:**

```bash
cd frontend
npm install
```

---

## 📁 File Structure Created

```
backend/
├── src/
│   ├── config/
│   │   ├── db.js           # MongoDB connection
│   │   └── env.js          # Environment variables
│   ├── models/
│   │   ├── Hospital.js     # Hospital schema
│   │   ├── Otp.js          # OTP schema
│   │   └── Session.js      # Session schema
│   ├── services/
│   │   ├── otp.service.js  # OTP logic
│   │   ├── sms.service.js  # SMS placeholder
│   │   └── token.service.js # Token management
│   ├── controllers/
│   │   └── auth.controller.js
│   ├── routes/
│   │   └── auth.routes.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── validateRequest.js
│   │   ├── rateLimiter.js
│   │   └── errorHandler.js
│   ├── utils/
│   │   ├── generateOtp.js
│   │   ├── hash.js
│   │   └── jwt.js
│   └── index.js

frontend/
├── src/
│   ├── components/
│   │   ├── TextInput.tsx
│   │   ├── OtpInput.tsx
│   │   ├── Button.tsx
│   │   ├── LogoHeader.tsx
│   │   ├── ErrorMessage.tsx
│   │   ├── CountdownTimer.tsx
│   │   └── ProtectedRoute.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── OtpVerification.tsx
│   │   └── Dashboard.tsx
│   ├── services/
│   │   ├── api.ts
│   │   └── authService.ts
│   ├── hooks/
│   │   └── useAuth.ts
│   ├── routes/
│   │   └── AppRoutes.tsx
│   ├── utils/
│   │   └── validator.ts
│   ├── types/
│   │   └── auth.ts
│   ├── config/
│   │   └── constants.ts
│   ├── globals.css
│   ├── App.tsx
│   └── main.tsx
```

---

## 🎯 Next Steps

### Extend Backend

- Add dashboard endpoints
- Implement hospital management
- Add audit logs
- Email notifications

### Extend Frontend

- Create admin dashboard
- Add hospital settings page
- Implement activity logs
- Add profile management

---

## 📚 Resources

- **Backend Docs**: `./backend/README.md`
- **Frontend Docs**: `./frontend/README.md`
- **Main Docs**: `./README.md`

---

## ✅ Checklist

- [ ] Dependencies installed (backend & frontend)
- [ ] MongoDB running
- [ ] `.env` files configured
- [ ] Backend started (`npm run dev`)
- [ ] Frontend started (`npm run dev`)
- [ ] Database seeded (optional)
- [ ] Can login with demo credentials
- [ ] OTP verification works
- [ ] Dashboard displays after login

---

## 💡 Tips

- **Hot Reload**: Both frontend and backend use hot reload (nodemon + Vite)
- **Development OTP**: Check backend console for OTP in dev mode
- **TypeScript**: Full type safety - catch errors at build time
- **TailwindCSS**: Responsive design - works on mobile
- **Token Storage**: Tokens stored in localStorage (replace with secure storage in production)

---

**Ready to build!** 🚀
