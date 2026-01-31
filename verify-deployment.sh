#!/usr/bin/env bash
# 🏥 HOSPITAL MANAGEMENT - PATIENT MODULE DEPLOYMENT SCRIPT
# This script helps verify everything is ready for deployment

echo "═══════════════════════════════════════════════════════════════"
echo "  🏥 Hospital Management - Patient Module Deployment Check"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✅${NC} $1"
        return 0
    else
        echo -e "${RED}❌${NC} $1 (NOT FOUND)"
        return 1
    fi
}

check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✅${NC} $1 is installed"
        return 0
    else
        echo -e "${RED}❌${NC} $1 is NOT installed"
        return 1
    fi
}

echo -e "${BLUE}1. FRONTEND FILES${NC}"
echo "─────────────────────────────────────────────────────────────"
check_file "frontend/src/pages/LandingPage.tsx"
check_file "frontend/src/pages/PatientsList.tsx"
check_file "frontend/src/pages/PatientDetails.tsx"
check_file "frontend/src/pages/FileList.tsx"
check_file "frontend/src/components/SkeletonLoader.tsx"
check_file "frontend/src/components/Toast.tsx"
check_file "frontend/src/components/ErrorBoundary.tsx"
check_file "frontend/src/services/patientApi.ts"
check_file "frontend/src/routes/AppRoutes.tsx"
echo ""

echo -e "${BLUE}2. BACKEND FILES${NC}"
echo "─────────────────────────────────────────────────────────────"
check_file "backend/src/models/Patient.js"
check_file "backend/src/services/r2.service.js"
check_file "backend/src/services/patient.service.js"
check_file "backend/src/controllers/patient.controller.js"
check_file "backend/src/routes/patient.routes.js"
check_file "backend/src/jobs/autoDelete.job.js"
echo ""

echo -e "${BLUE}3. CONFIGURATION FILES${NC}"
echo "─────────────────────────────────────────────────────────────"
check_file "backend/.env"
echo ""

echo -e "${BLUE}4. DOCUMENTATION${NC}"
echo "─────────────────────────────────────────────────────────────"
check_file "QUICK_START.md"
check_file "PATIENT_MODULE_CHECKLIST.md"
check_file "IMPLEMENTATION_COMPLETE.md"
check_file "ARCHITECTURE.md"
check_file "FILE_INVENTORY.md"
echo ""

echo -e "${BLUE}5. DEPENDENCIES${NC}"
echo "─────────────────────────────────────────────────────────────"
echo "Checking backend dependencies..."
cd backend 2>/dev/null
if npm list pdfkit archiver node-cron @aws-sdk/client-s3 > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} All backend dependencies installed"
else
    echo -e "${YELLOW}⚠️${NC} Some dependencies may need installation"
    echo "   Run: npm install pdfkit archiver node-cron @aws-sdk/client-s3 @aws-sdk/s3-request-presigner"
fi
cd ..
echo ""

echo -e "${BLUE}6. SYSTEM COMMANDS${NC}"
echo "─────────────────────────────────────────────────────────────"
check_command "node"
check_command "npm"
check_command "mongod"
echo ""

echo -e "${BLUE}7. ENVIRONMENT VARIABLES${NC}"
echo "─────────────────────────────────────────────────────────────"
if [ -f "backend/.env" ]; then
    if grep -q "R2_ENDPOINT" backend/.env; then
        echo -e "${GREEN}✅${NC} R2_ENDPOINT configured"
    else
        echo -e "${YELLOW}⚠️${NC} R2_ENDPOINT not found in .env"
    fi
    
    if grep -q "R2_ACCESS_KEY_ID" backend/.env; then
        echo -e "${GREEN}✅${NC} R2_ACCESS_KEY_ID configured"
    else
        echo -e "${YELLOW}⚠️${NC} R2_ACCESS_KEY_ID not found in .env"
    fi
    
    if grep -q "R2_SECRET_ACCESS_KEY" backend/.env; then
        echo -e "${GREEN}✅${NC} R2_SECRET_ACCESS_KEY configured"
    else
        echo -e "${YELLOW}⚠️${NC} R2_SECRET_ACCESS_KEY not found in .env"
    fi
    
    if grep -q "R2_BUCKET_NAME" backend/.env; then
        echo -e "${GREEN}✅${NC} R2_BUCKET_NAME configured"
    else
        echo -e "${YELLOW}⚠️${NC} R2_BUCKET_NAME not found in .env"
    fi
else
    echo -e "${RED}❌${NC} backend/.env file not found"
    echo "   Create it and add R2 configuration"
fi
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ DEPLOYMENT CHECK COMPLETE${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1. Verify all files are checked (✅ symbols)"
echo ""
echo "2. Install dependencies (if needed):"
echo "   cd backend"
echo "   npm install pdfkit archiver node-cron @aws-sdk/client-s3 @aws-sdk/s3-request-presigner"
echo ""
echo "3. Configure environment:"
echo "   - Edit backend/.env"
echo "   - Add R2 credentials from Cloudflare"
echo ""
echo "4. Start services:"
echo "   Terminal 1: cd backend && npm start"
echo "   Terminal 2: cd frontend && npm start"
echo ""
echo "5. Test in browser:"
echo "   - Navigate to http://localhost:3000"
echo "   - Login with hospital credentials"
echo "   - Click 'View Patients'"
echo ""
echo "6. View documentation:"
echo "   - QUICK_START.md - 5-minute setup"
echo "   - PATIENT_MODULE_CHECKLIST.md - Full testing"
echo "   - IMPLEMENTATION_COMPLETE.md - Features"
echo "   - ARCHITECTURE.md - System design"
echo ""
echo "═══════════════════════════════════════════════════════════════"
