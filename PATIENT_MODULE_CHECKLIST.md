# Patient Management Module - Deployment Checklist

## ✅ COMPLETED

### Backend Implementation

- [x] Patient MongoDB model with nested folders/files structure
- [x] R2 file service (AWS S3 SDK v3 integration)
- [x] Patient service business logic
- [x] Patient controller with PDF/ZIP generation
- [x] Patient routes (8 endpoints)
- [x] Auto-delete cron job (90-day cleanup)
- [x] Environment configuration for R2
- [x] Main server initialization with routes

### Frontend Implementation

- [x] Patient API service (TypeScript, all endpoints)
- [x] LandingPage component
- [x] PatientsList page (paginated, searchable)
- [x] PatientDetails page (folder display)
- [x] FileList page (file display, downloads)
- [x] SkeletonLoader component
- [x] Toast notification component
- [x] ErrorBoundary component
- [x] AppRoutes updated with all patient routes

## 📋 INSTALLATION STEPS

### 1. Install Backend Dependencies

```bash
cd backend
npm install pdfkit archiver node-cron @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Verify installation:**

```bash
npm list pdfkit archiver node-cron @aws-sdk/client-s3
```

### 2. Update Environment Variables

Add to `.env` file:

```
# Cloudflare R2 Configuration
R2_ENDPOINT=https://your-r2-endpoint.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=your-bucket-name
```

### 3. Test Backend Endpoints

```bash
# Start backend server
npm start

# In another terminal, test endpoints:
curl http://localhost:5000/api/patients

# Test cron job scheduling
# Check server logs for: "✓ Auto-delete job scheduled"
```

### 4. Verify Frontend Components

```bash
# Start frontend
npm start

# Navigate to: http://localhost:3000
# Should see LandingPage with "View Patients" button
```

## 🧪 TEST SCENARIOS

### Test 1: Login Flow

1. Navigate to `/login`
2. Enter valid hospital credentials
3. Verify OTP submission
4. Should redirect to LandingPage (`/`)

### Test 2: Patient Management

1. Click "View Patients" on LandingPage
2. Should load PatientsList with paginated results
3. Click patient row → PatientDetails
4. Click folder card → FileList
5. Verify download buttons work for PDF/ZIP

### Test 3: Search & Pagination

1. On PatientsList, type in search box
2. Verify filtering works by name/medical record number
3. Test pagination controls
4. Verify page resets when searching

### Test 4: File Downloads

1. Navigate to FileList for any patient folder
2. Click "Folder as PDF" → Should trigger browser download
3. Click "Folder as ZIP" → Should trigger browser download
4. Check "All Records PDF/ZIP" buttons work

### Test 5: Error Handling

1. Try accessing patient that doesn't exist (URL: `/patients/invalid-id`)
2. Should show error toast and redirect to PatientsList
3. Try downloading large file → Should show loading state

### Test 6: Mobile Responsiveness

1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Test on 320px (mobile), 768px (tablet), 1024px (desktop)
4. Verify navigation works on all sizes

### Test 7: Auto-Delete Cron Job

```bash
# To manually test (don't wait 90 days):
curl -X DELETE http://localhost:5000/api/patients/autodelete

# Should return count of deleted patients and files
# Check database: old patients should be removed
# Check R2: old patient folders should be deleted
```

## 📁 FILE STRUCTURE

```
frontend/
├── src/
│   ├── pages/
│   │   ├── LandingPage.tsx          ✅ NEW
│   │   ├── PatientsList.tsx         ✅ NEW
│   │   ├── PatientDetails.tsx       ✅ NEW
│   │   ├── FileList.tsx             ✅ NEW
│   │   ├── Login.tsx                (existing)
│   │   ├── OtpVerification.tsx       (existing)
│   │   └── Dashboard.tsx             (existing)
│   ├── components/
│   │   ├── SkeletonLoader.tsx       ✅ NEW
│   │   ├── Toast.tsx                ✅ NEW
│   │   ├── ErrorBoundary.tsx        ✅ NEW
│   │   ├── Button.tsx               (existing)
│   │   └── ProtectedRoute.tsx        (existing)
│   ├── services/
│   │   ├── patientApi.ts            ✅ NEW
│   │   └── authService.ts           (existing)
│   ├── hooks/
│   │   └── useAuth.tsx              (existing)
│   ├── routes/
│   │   └── AppRoutes.tsx            ✅ UPDATED
│   └── App.tsx                      (existing)

backend/
├── src/
│   ├── models/
│   │   └── Patient.js               ✅ NEW
│   ├── services/
│   │   ├── r2.service.js            ✅ NEW
│   │   └── patient.service.js       ✅ NEW
│   ├── controllers/
│   │   └── patient.controller.js    ✅ NEW
│   ├── routes/
│   │   └── patient.routes.js        ✅ NEW
│   ├── jobs/
│   │   └── autoDelete.job.js        ✅ NEW
│   ├── config/
│   │   └── env.js                   ✅ UPDATED
│   └── index.js                     ✅ UPDATED
```

## 🔐 SECURITY NOTES

1. **Hospital Isolation**: All endpoints validate `hospitalId` to prevent cross-hospital access
2. **File URLs**: Patient list endpoints don't expose R2 URLs for security
3. **Generic Error Messages**: Login errors are intentionally generic
4. **Rate Limiting**: Download endpoints have rate limiting to prevent abuse
5. **Token Validation**: All patient endpoints require valid JWT token

## 🚀 DEPLOYMENT

### Production Checklist

- [ ] R2 credentials configured in .env
- [ ] Database connection verified (MongoDB Atlas or local)
- [ ] All dependencies installed (`pdfkit`, `archiver`, `node-cron`, `@aws-sdk/*`)
- [ ] Frontend built: `npm run build`
- [ ] Backend environment set to production
- [ ] SSL certificates configured
- [ ] CORS properly configured for production domain
- [ ] Rate limiter settings appropriate for expected load

### Start Services

```bash
# Backend
cd backend
npm start

# Frontend (separate terminal)
cd frontend
npm start
```

## 📊 API ENDPOINTS

### Patient Endpoints

- `GET /api/patients` - List all patients (paginated)
- `GET /api/patients/:id` - Get patient with folders
- `GET /api/patients/:id/files/:folder` - Get files in folder
- `GET /api/patients/:id/download/pdf` - Download all records as PDF
- `GET /api/patients/:id/folders/:folder/pdf` - Download folder as PDF
- `GET /api/patients/:id/download/zip` - Download all records as ZIP
- `GET /api/patients/:id/folders/:folder/zip` - Download folder as ZIP
- `DELETE /api/patients/autodelete` - Trigger auto-delete (cron job only)

## 🐛 TROUBLESHOOTING

### Issue: R2 credentials error

**Solution**: Verify credentials in .env match your Cloudflare R2 setup

### Issue: PDF download fails

**Solution**: Ensure pdfkit is installed and file URLs are accessible

### Issue: ZIP generation times out

**Solution**: Implement chunked transfer for large files, increase timeout

### Issue: Cron job not running

**Solution**: Check server logs for "✓ Auto-delete job scheduled" message

### Issue: Files not deleting after 90 days

**Solution**: Verify MongoDB TTL indexes created, check createdAt field populated

## 📞 SUPPORT

For issues or questions:

1. Check server logs: `tail -f backend/logs/*`
2. Check browser console: F12 → Console tab
3. Verify database connection: `mongo <connection-string>`
4. Test R2 connectivity: Verify endpoint and credentials

---

**Module Status**: ✅ READY FOR DEPLOYMENT

All components implemented and integrated. Installation steps and tests provided above.
