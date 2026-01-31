# Hospital Management Frontend

## Overview

Production-ready React + TypeScript frontend for Hospital Management System with Login + 2FA OTP Verification.

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **State Management**: React Context + Hooks

## Project Structure

```
frontend/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── TextInput.tsx
│   │   ├── OtpInput.tsx
│   │   ├── Button.tsx
│   │   ├── LogoHeader.tsx
│   │   ├── ErrorMessage.tsx
│   │   ├── CountdownTimer.tsx
│   │   └── ProtectedRoute.tsx
│   ├── pages/             # Page components
│   │   ├── Login.tsx
│   │   ├── OtpVerification.tsx
│   │   └── Dashboard.tsx
│   ├── services/          # API communication
│   │   ├── api.ts         # Axios instance
│   │   └── authService.ts # Auth API calls
│   ├── hooks/             # Custom React hooks
│   │   └── useAuth.ts     # Auth context & hook
│   ├── utils/             # Utility functions
│   │   └── validator.ts   # Form validation
│   ├── config/            # Configuration
│   │   └── constants.ts   # App constants
│   ├── types/             # TypeScript definitions
│   │   └── auth.ts        # Auth types
│   ├── routes/            # Route definitions
│   │   └── AppRoutes.tsx
│   ├── globals.css        # Global styles
│   ├── App.tsx            # Main App component
│   └── main.tsx           # Entry point
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

## Installation

### Prerequisites

- Node.js v16+
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

   Edit `.env`:

   ```
   VITE_API_URL=http://localhost:5000
   VITE_APP_NAME="Hospital Management System"
   ```

3. **Start development server**

   ```bash
   npm run dev
   ```

   Opens http://localhost:3000

4. **Build for production**
   ```bash
   npm run build
   ```

## Features

### Authentication Flow

1. **Login Page** - Email and password entry
2. **OTP Verification** - 6-digit OTP with auto-verification
3. **Protected Routes** - Dashboard accessible only after authentication
4. **Token Management** - Automatic token refresh and storage

### Components

#### TextInput

- Email/password input with validation
- Error messages
- Icon support
- Accessible and responsive

#### OtpInput

- 6 separate input boxes
- Auto-focus on next input
- Backspace to delete
- Paste support
- Auto-verification when complete

#### Button

- Multiple variants (primary, secondary, danger, ghost)
- Loading states with spinner
- Full-width option
- Icon support

#### CountdownTimer

- Resend OTP timer
- Countdown display (30-60 seconds)
- Resend button on expiry

#### ErrorMessage

- Error, warning, and info types
- Dismissible alerts
- Icons and colors

### Hooks

#### useAuth

- Authentication state management
- Login, OTP verification, logout
- Token storage and retrieval
- Error handling

### Services

#### authService

- `login(email, password)` - Login request
- `verifyOtp(otp)` - OTP verification
- `resendOtp()` - Resend OTP
- `refreshToken(token)` - Token refresh
- `logout(token)` - Logout
- Token management utilities

### Security Features

✅ **Token Management**: Auto-refresh access tokens
✅ **Secure Storage**: Tokens in localStorage with JWT
✅ **Error Handling**: Centralized error management
✅ **Input Validation**: Real-time form validation
✅ **CORS Enabled**: Secure cross-origin requests
✅ **TypeScript**: Full type safety
✅ **Protected Routes**: Route-level access control

## API Integration

### Login

```typescript
POST / api / auth / login;
Body: {
  email, password;
}
Response: {
  tempToken, phone, expiresAt, hospitalName, logoUrl;
}
```

### Verify OTP

```typescript
POST / api / auth / verify - otp;
Headers: Authorization: Bearer<tempToken>;
Body: {
  otp;
}
Response: {
  accessToken, refreshToken, hospital;
}
```

### Refresh Token

```typescript
POST / api / auth / refresh - token;
Body: {
  refreshToken;
}
Response: {
  accessToken, refreshToken;
}
```

## Demo Credentials

```
Email: admin@citymedical.com
Password: Password123

Email: admin@greenvalley.com
Password: Password123

Email: admin@royalcare.com
Password: Password123
```

## Development

### Running Development Server

```bash
npm run dev
```

Auto-reload on file changes.

### Type Checking

```bash
npm run type-check
```

### Building for Production

```bash
npm run build
npm run preview
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers

## Performance

- Code splitting with React Router
- Lazy loading components
- Optimized images
- CSS purging with TailwindCSS
- Minified production build

## Testing

API can be tested using Postman or cURL with sample requests provided in backend README.

## Deployment

### Vercel

```bash
npm i -g vercel
vercel
```

### Netlify

```bash
npm run build
# Connect to Netlify via GitHub
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

## Troubleshooting

### CORS Errors

- Verify backend CORS configuration
- Check `VITE_API_URL` in `.env`

### Token Refresh Issues

- Ensure refresh token is stored correctly
- Check token expiry times

### OTP Not Working

- Verify backend is running
- Check browser console for errors
- Verify API URL configuration

## Contributing

1. Create feature branch
2. Make changes
3. Test thoroughly
4. Submit pull request

## License

MIT License - See LICENSE file
