# 🏥 Hospital Management System - Login + 2FA OTP

> **Complete Production-Ready Implementation**: Full-Stack Hospital Management System with secure authentication, 2-factor OTP verification, JWT tokens, and MongoDB persistence.

---

## 📋 **Overview**

This is a complete, enterprise-grade authentication system for a Hospital Management Web Application with:

✅ **Secure Login** - Email/password authentication with bcrypt hashing  
✅ **2FA OTP** - Time-based one-time passwords (5-minute expiry)  
✅ **JWT Tokens** - Access & refresh tokens for session management  
✅ **MongoDB** - Persistent storage with TTL indexes  
✅ **Device Fingerprinting** - Single-device login enforcement  
✅ **Rate Limiting** - Brute force protection  
✅ **Mobile Responsive** - Professional UI with TailwindCSS  
✅ **Type-Safe** - Full TypeScript implementation  
✅ **Production Ready** - Error handling, validation, security headers

---

## 🚀 **Quick Start**

### Prerequisites

- Node.js v16+ and npm
- MongoDB 4.4+ (local or cloud)
- Git

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
npm run dev  # Starts on http://localhost:5000
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev  # Starts on http://localhost:3000
```

### Seed Database

```bash
cd backend
node scripts/seed.js
```

Demo credentials will be created automatically.

---

## 📂 **Project Structure**

```
Hospital-Management/
├── backend/              # Node.js/Express API
│   ├── src/
│   │   ├── config/      # Database & env config
│   │   ├── models/      # MongoDB schemas
│   │   ├── controllers/ # Route handlers
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic
│   │   ├── middleware/  # Auth, validation
│   │   ├── utils/       # Helpers
│   │   └── __tests__/   # Tests
│   └── scripts/         # Utilities
│
├── frontend/             # React + TypeScript UI
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API layer
│   │   ├── hooks/       # Custom hooks
│   │   ├── routes/      # Router config
│   │   └── utils/       # Utilities
│   └── index.html
│
└── README.md
```

---

## 🔐 **Authentication Flow**

**Login** → **OTP Sent** → **Verify OTP** → **JWT Tokens** → **Dashboard**

1. User enters email/password
2. Backend validates and sends OTP
3. Frontend displays OTP input page
4. User enters 6-digit code
5. Backend verifies OTP
6. Session created with JWT tokens
7. Auto-redirect to dashboard

---

## 📱 **Demo Credentials**

```
Email: admin@citymedical.com
Password: Password123

Email: admin@greenvalley.com
Password: Password123

Email: admin@royalcare.com
Password: Password123
```

---

## 📖 **Documentation**

- **Backend**: `./backend/README.md`
- **Frontend**: `./frontend/README.md`

---

## ✨ **Features**

✅ Complete login + 2FA flow  
✅ OTP generation & verification  
✅ JWT token management  
✅ MongoDB with TTL indexes  
✅ Single-device login  
✅ Rate limiting  
✅ Mobile responsive UI  
✅ TypeScript throughout  
✅ Production-ready

---

## 🔒 **Security**

- Bcryptjs password hashing
- JWT token security
- OTP hashing with TTL
- Rate limiting
- CORS protection
- Input validation
- Error handling middleware

---

## 🚀 **Deployment Ready**

This project is fully production-ready with:

- Error handling & validation
- Security best practices
- Performance optimizations
- Comprehensive documentation
- Test suite included
- Docker support

---

**Built for Hospital Management Excellence** ❤️
