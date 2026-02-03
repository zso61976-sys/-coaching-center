@echo off
echo ========================================
echo  Coaching Center - Starting Servers
echo ========================================
echo.

echo Starting Backend Server (Port 3000)...
start "Backend Server" cmd /k "cd /d D:\Claude\Cochingcenter\backend && npm run start:dev"

timeout /t 5 /nobreak > nul

echo Starting Frontend Server (Port 3005)...
start "Frontend Server" cmd /k "cd /d D:\Claude\Cochingcenter\frontend\admin-new && npm run dev -- -p 3005"

echo.
echo ========================================
echo  Servers Starting...
echo ========================================
echo.
echo Backend:  http://localhost:3000
echo Frontend: http://localhost:3005
echo.
echo Login Credentials:
echo ------------------
echo Super Admin: (empty code) / superadmin@system.com / SuperAdmin@123
echo Company Admin: EXCELL / admin@example.com / Admin@123456
echo.
echo Press any key to close this window...
pause > nul
