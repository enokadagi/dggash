# DGGASH - Step-by-Step Fix Guide
**Document Type:** Technical Fix Procedures  
**Date:** September 1, 2026  
**Audience:** Developers

---

## 🔧 FIX GUIDE - COMPLETE STEP-BY-STEP INSTRUCTIONS

---

## FIX #1: NestJS CLI Schematics Error (15 minutes)

### Problem
```
Error: Package "@nestjs/cli" was found but does not support schematics
When running: npm run dev or npm run start:dev
```

### Root Cause
Incompatible versions of @angular-devkit/schematics and @nestjs/cli

### Solution A: Quick Workaround (2 minutes - Use while fixing)
```bash
# Navigate to API directory
cd c:\Users\Admin\Projects\dggash\apps\api

# Build the TypeScript to JavaScript
npm run build

# Start the built application
node dist/main.js

# API will start on http://localhost:3001
```

### Solution B: Permanent Fix (10 minutes)

#### Step 1: Remove problematic packages
```bash
cd c:\Users\Admin\Projects\dggash\apps\api
npm uninstall @nestjs/cli @angular-devkit/schematics
```

#### Step 2: Reinstall with compatible versions
```bash
npm install -D @nestjs/cli@11.0.24
npm install -D @angular-devkit/schematics@17.0.0
npm install -D @angular/core@17.0.0
npm install -D @angular/common@17.0.0
```

#### Step 3: Verify installation
```bash
npm list @nestjs/cli
npm list @angular-devkit/schematics
```

#### Step 4: Test
```bash
npm run build    # Should succeed
npm run dev      # Should start dev server
```

### Solution C: Alternative Dev Script (5 minutes)

#### Edit `apps/api/package.json`
Find the scripts section and add these lines:
```json
"scripts": {
  "build": "tsc -p tsconfig.build.json",
  "start": "nest start",
  "start:dev": "nest start --watch",
  "start:prod": "node dist/main.js",
  "dev:direct": "npm run build && node dist/main.js",
  "dev:watch": "tsc --watch",
  "lint": "eslint \"{src,test}/**/*.ts\" --fix",
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:cov": "jest --coverage",
  "test:e2e": "jest --config ./jest-e2e.config.ts"
}
```

Then use:
```bash
npm run dev:direct   # Builds and starts without CLI
```

### Verification
- Navigate to: http://localhost:3001/api/docs
- Should see Swagger documentation
- API should respond to requests

---

## FIX #2: Create Environment Configuration Files (5 minutes)

### Problem
```
No .env file for development
Database connection fails
Missing JWT secret and other configuration
```

### Solution

#### Step 1: Create `.env.development` in `apps/api/`

**File Location:** `c:\Users\Admin\Projects\dggash\apps\api\.env.development`

**Content:**
```env
# ==========================================
# ENVIRONMENT
# ==========================================
NODE_ENV=development
APP_NAME=DGGASH
APP_VERSION=1.0.0

# ==========================================
# DATABASE
# ==========================================
DATABASE_URL="file:./dev.db"
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=dggash_dev
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres

# ==========================================
# JWT
# ==========================================
JWT_SECRET="dev-secret-key-change-in-production-immediately"
JWT_EXPIRY=900
JWT_REFRESH_SECRET="dev-refresh-secret-key-change-in-production"
REFRESH_TOKEN_EXPIRY=604800

# ==========================================
# API SERVER
# ==========================================
API_PORT=3001
API_HOST=localhost
API_PROTOCOL=http
API_BASE_URL=http://localhost:3001

# ==========================================
# WEB SERVER
# ==========================================
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=DGGASH
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ==========================================
# EMAIL CONFIGURATION (OPTIONAL)
# ==========================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@dggash.com
SMTP_FROM_NAME=DGGASH

# ==========================================
# WHATSAPP INTEGRATION (OPTIONAL)
# ==========================================
WHATSAPP_API_KEY=your-whatsapp-api-key
WHATSAPP_PHONE_ID=your-phone-id
WHATSAPP_API_URL=https://graph.instagram.com/v18.0

# ==========================================
# LOGGING
# ==========================================
LOG_LEVEL=debug
LOG_FORMAT=json

# ==========================================
# SECURITY
# ==========================================
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true
RATE_LIMIT=100
RATE_LIMIT_TTL=60

# ==========================================
# FEATURES
# ==========================================
ENABLE_2FA=true
ENABLE_EMAIL_VERIFICATION=false
ENABLE_BACKUP=true
ENABLE_AUDIT_LOG=true
```

#### Step 2: Create `.env.production` in `apps/api/`

**File Location:** `c:\Users\Admin\Projects\dggash\apps\api\.env.production`

**Content:**
```env
# ==========================================
# ENVIRONMENT
# ==========================================
NODE_ENV=production
APP_NAME=DGGASH
APP_VERSION=1.0.0

# ==========================================
# DATABASE - USE POSTGRESQL IN PRODUCTION
# ==========================================
DATABASE_URL="postgresql://user:password@prod-db-host:5432/dggash_prod"
DATABASE_HOST=prod-db-host
DATABASE_PORT=5432
DATABASE_NAME=dggash_prod
DATABASE_USER=dggash_user
DATABASE_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# ==========================================
# JWT - USE STRONG SECRETS
# ==========================================
JWT_SECRET="CHANGE_ME_VERY_LONG_RANDOM_SECRET_STRING"
JWT_EXPIRY=900
JWT_REFRESH_SECRET="CHANGE_ME_VERY_LONG_RANDOM_REFRESH_SECRET"
REFRESH_TOKEN_EXPIRY=604800

# ==========================================
# API SERVER
# ==========================================
API_PORT=3001
API_HOST=0.0.0.0
API_PROTOCOL=https
API_BASE_URL=https://api.yourdomain.com

# ==========================================
# WEB SERVER
# ==========================================
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_APP_NAME=DGGASH
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# ==========================================
# EMAIL CONFIGURATION
# ==========================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=CHANGE_ME_APP_PASSWORD
SMTP_FROM=noreply@yourdomain.com
SMTP_FROM_NAME=DGGASH Support

# ==========================================
# WHATSAPP INTEGRATION
# ==========================================
WHATSAPP_API_KEY=CHANGE_ME_ACTUAL_API_KEY
WHATSAPP_PHONE_ID=CHANGE_ME_PHONE_ID
WHATSAPP_API_URL=https://graph.instagram.com/v18.0

# ==========================================
# LOGGING
# ==========================================
LOG_LEVEL=warn
LOG_FORMAT=json

# ==========================================
# SECURITY
# ==========================================
CORS_ORIGIN=https://yourdomain.com
CORS_CREDENTIALS=true
RATE_LIMIT=1000
RATE_LIMIT_TTL=60

# ==========================================
# FEATURES
# ==========================================
ENABLE_2FA=true
ENABLE_EMAIL_VERIFICATION=true
ENABLE_BACKUP=true
ENABLE_AUDIT_LOG=true
```

#### Step 3: Update `.gitignore`

Make sure these files are NOT committed:
```bash
# In root .gitignore
apps/api/.env
apps/api/.env.development
apps/api/.env.production
apps/api/.env.local
apps/web/.env.local
apps/web/.env.development.local
apps/web/.env.production.local
```

#### Step 4: Create `.env.example` for documentation

**File Location:** `c:\Users\Admin\Projects\dggash\apps\api\.env.example`

```env
# Copy this file to .env.development or .env.production
# Then fill in your actual values

NODE_ENV=development
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret-here"
JWT_EXPIRY=900
REFRESH_TOKEN_EXPIRY=604800
API_PORT=3001
API_HOST=localhost
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Verification
- File exists at: `c:\Users\Admin\Projects\dggash\apps\api\.env.development`
- Contains all required environment variables
- Database URL is correct

---

## FIX #3: Apply Database Migrations (2 minutes)

### Problem
```
Prisma schema exists but not synced to database
Database tables don't exist
API crashes when trying to query database
```

### Solution

#### Step 1: Generate Prisma Client
```bash
cd c:\Users\Admin\Projects\dggash
npm run db:generate --workspace=packages/database
```

**Expected output:**
```
✅ Generated Prisma Client to ./dist/client
```

#### Step 2: Sync Database Schema
```bash
cd c:\Users\Admin\Projects\dggash
npm run db:push --workspace=packages/database
```

**Expected output:**
```
✅ Database schema pushed to SQLite database
✅ Ready to query
```

#### Step 3: Seed Sample Data
```bash
cd c:\Users\Admin\Projects\dggash
npm run db:seed --workspace=packages/database
```

**Expected output:**
```
✅ Database seeded successfully
✅ Demo user created
✅ Sample plans created
```

#### Step 4: Verify Database (Optional)
```bash
cd c:\Users\Admin\Projects\dggash
npm run db:studio --workspace=packages/database
```

This opens Prisma Studio at: http://localhost:5555

### Verification Checklist
- [ ] No errors during push
- [ ] No errors during seed
- [ ] Database file exists: `c:\Users\Admin\Projects\dggash\apps\api\dev.db`
- [ ] Can see tables in Prisma Studio
- [ ] Demo user exists (phone: +1000000000)

---

## FIX #4: Next.js Middleware Deprecation Warning (5 minutes)

### Problem
```
Warning: The "middleware" file convention is deprecated
Please use "proxy" instead
To migrate automatically, run: npx @next/codemod@canary middleware-to-proxy .
```

### Solution

#### Step 1: Run Migration Codemod
```bash
cd c:\Users\Admin\Projects\dggash\apps\web

# Option A: Use canary version
npx @next/codemod@canary middleware-to-proxy .

# Option B: Use latest version
npx @next/codemod middleware-to-proxy .
```

#### Step 2: Verify Changes
- Review file changes
- Check if middleware.ts was updated
- Verify routes still work

#### Step 3: Test
```bash
npm run dev
# Navigate to http://localhost:3000
# Verify pages load without warnings
```

### Verification
- No warnings in Next.js dev server output
- All pages load correctly
- API requests still work

---

## 🧪 VERIFICATION CHECKLIST

### After All Fixes, Run This Checklist

```bash
# 1. Check environment file exists
Test-Path "c:\Users\Admin\Projects\dggash\apps\api\.env.development"

# 2. Check database file exists
Test-Path "c:\Users\Admin\Projects\dggash\apps\api\dev.db"

# 3. Build API
cd c:\Users\Admin\Projects\dggash\apps\api
npm run build
# Should show: "Successfully compiled 1000+ files"

# 4. Start API (in Terminal 1)
node dist/main.js
# Should show: "API Server listening on 3001"

# 5. Test API (in Terminal 2)
$response = Invoke-WebRequest -Uri "http://localhost:3001/api/docs" -UseBasicParsing
Write-Host "API Status: $($response.StatusCode)"
# Should show: 200

# 6. Start Web Server (in Terminal 3)
cd c:\Users\Admin\Projects\dggash\apps\web
npm run dev
# Should show: "✓ Ready in 13.2s"

# 7. Test Web App (in Terminal 2)
$response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing
Write-Host "Web Status: $($response.StatusCode)"
# Should show: 200

# 8. Test Login
# Navigate to: http://localhost:3000/login
# Use credentials:
#   Phone: +1000000000
#   Password: SuperAdmin123!
# Should login successfully
```

---

## 📋 TROUBLESHOOTING

### Issue: "Cannot find module" error
**Solution:** 
```bash
cd apps/api
npm install
npm run build
```

### Issue: Database connection fails
**Solution:**
```bash
# Check .env.development exists and has DATABASE_URL
cat apps/api/.env.development

# Recreate database
npm run db:push --workspace=packages/database
npm run db:seed --workspace=packages/database
```

### Issue: Port 3001 already in use
**Solution:**
```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process
taskkill /PID <PID> /F

# Or use different port in .env.development
# Change: API_PORT=3002
```

### Issue: npm commands not found
**Solution:**
```bash
# Reinstall node_modules
cd c:\Users\Admin\Projects\dggash
rm -r node_modules package-lock.json
npm install

# Install workspace dependencies
npm install --workspaces
```

---

## ⏱️ TOTAL TIME TO FIX ALL ISSUES

| Fix | Time | Difficulty |
|-----|------|------------|
| #1: NestJS CLI | 15 min | Medium |
| #2: .env Files | 5 min | Easy |
| #3: DB Migrations | 2 min | Easy |
| #4: Next.js Warning | 5 min | Easy |
| **TOTAL** | **27 min** | **Easy** |

---

## ✅ SUCCESS CRITERIA

After completing all fixes, verify:

- [x] API server starts without errors
- [x] Web server starts without warnings
- [x] Demo login works (phone: +1000000000)
- [x] Dashboard loads with data
- [x] No console errors
- [x] API Swagger docs available
- [x] Database queries execute successfully
- [x] All pages navigate correctly

---

## 🚀 NEXT STEPS AFTER FIXES

1. **Test Full User Flow**
   - Register new user
   - Login as customer
   - View dashboard
   - Create support ticket
   - View invoice

2. **Test Admin Functions**
   - View user list
   - Create customer
   - View reports
   - Access settings

3. **Test API Endpoints**
   - Call API endpoints
   - Verify responses
   - Check error handling

4. **Performance Testing**
   - Load dashboard with 100 records
   - Generate large report
   - Measure response times

---

**Created:** September 1, 2026  
**Updated:** As fixes are applied  
**Status:** Ready to follow

