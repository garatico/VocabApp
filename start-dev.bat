@echo off
REM VocabApp Development Server Startup Script
REM For Windows

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                     VocabApp                               ║
echo ║            Starting Development Server                     ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
    echo.
)

REM Check if dependencies are installed
if not exist "node_modules\concurrently" (
    echo Installing missing dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
)

echo Starting development server...
echo.
call npm run dev

if errorlevel 1 (
    echo.
    echo ERROR: Failed to start server
    pause
    exit /b 1
)

pause
