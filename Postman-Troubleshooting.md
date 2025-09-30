# 🔧 Postman Collection Troubleshooting Guide

## ❌ "Invalid Token" Error - Step-by-Step Fix

### **Step 1: Verify Environment Setup**
1. In Postman, check the **environment dropdown** (top-right corner)
2. Make sure **"Bus Tracking API - Local"** is selected
3. Click the **eye icon** next to the environment dropdown
4. Verify `base_url` is set to `http://localhost:3000`

### **Step 2: Check Docker Containers**
```powershell
docker-compose ps
```
Make sure all 3 containers are running:
- ✅ bus_tracking_api (port 3000)
- ✅ bus_tracking_db (port 5432) 
- ✅ bus_tracking_redis (port 6379)

### **Step 3: Test Login Manually**
1. Go to **Authentication → Admin Login**
2. Click **Send**
3. Check the **Test Results** tab (should show green checkmarks)
4. Check the **Console** tab (bottom) - should show "Admin token saved..."

### **Step 4: Verify Token is Saved**
1. Click the **eye icon** next to environment dropdown
2. Look for `admin_token` variable
3. Should show a long JWT token (starting with "eyJ...")
4. If empty or missing, the login didn't work properly

### **Step 5: Test Routes Endpoint**
1. Go to **Routes Management → Get All Routes**
2. Click **Send**
3. Check **Console** tab for debug messages
4. Should show "Using admin token: eyJ..." and "Found X routes"

## 🚨 Common Issues & Solutions

### Issue 1: Token Not Saving
**Symptoms**: Login works but `admin_token` is empty in environment
**Solution**: 
1. Re-import the updated collection
2. Make sure environment is selected
3. Try logging in again

### Issue 2: Wrong Environment Selected
**Symptoms**: `base_url` shows wrong URL or undefined
**Solution**:
1. Select "Bus Tracking API - Local" from environment dropdown
2. If not available, re-import the environment file

### Issue 3: Containers Not Running
**Symptoms**: Connection refused errors
**Solution**:
```powershell
docker-compose up -d
```

### Issue 4: Token Expired
**Symptoms**: Was working, now shows "Invalid token"
**Solution**: 
1. Tokens expire after 1 hour
2. Run **Admin Login** again
3. New token will be saved automatically

## 🔍 Debug Steps

### Check Token in Console
The updated collection now shows debug information in the Console:
1. Open Postman Console (bottom of screen)
2. Run any request
3. Look for debug messages like:
   - "Admin token saved: eyJ..."
   - "Using admin token: eyJ..."
   - "Found X routes"

### Manual Token Test
If automatic token saving isn't working:
1. Run **Admin Login**
2. Copy the token from the response
3. Go to **Environment** (eye icon)
4. Manually paste token into `admin_token` variable
5. Try **Get All Routes** again

### Raw Request Test
Test the API directly without Postman:
```powershell
# Get token
$body = @{email='admin@ntc.gov.lk';password='adminpass'} | ConvertTo-Json
$response = Invoke-RestMethod -Uri 'http://localhost:3000/auth/login' -Method POST -Body $body -ContentType 'application/json'
$token = $response.token

# Test routes
$headers = @{Authorization="Bearer $token"}
$routes = Invoke-RestMethod -Uri 'http://localhost:3000/routes' -Headers $headers
Write-Host "Found $($routes.routes.Count) routes"
```

## ✅ Expected Behavior

### After Admin Login:
- ✅ Status: 200 OK
- ✅ Response has `token` and `role` fields
- ✅ Console shows: "Admin token saved..."
- ✅ Environment shows `admin_token` with JWT value

### After Get All Routes:
- ✅ Status: 200 OK  
- ✅ Console shows: "Using admin token: eyJ..."
- ✅ Console shows: "Found 4 routes"
- ✅ Response shows array of route objects

## 📞 Still Having Issues?

1. **Clear Postman Cache**: Settings → Data → Clear Cache
2. **Restart Postman**: Close and reopen the application
3. **Re-import Collection**: Delete and import fresh collection
4. **Check Docker Logs**: `docker-compose logs api`

## 🎯 Quick Test Sequence

Try this exact sequence:
1. Select "Bus Tracking API - Local" environment
2. **Authentication → Admin Login** → Send
3. Check Console for "Admin token saved"
4. **Routes Management → Get All Routes** → Send  
5. Should return 4 routes successfully

If this sequence fails at any step, follow the debug steps above!