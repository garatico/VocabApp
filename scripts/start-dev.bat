@echo off
REM VocabApp Development Server Startup Script
REM For Windows

REM This script lives in scripts/, one level below the repo root — every
REM check and command below (node_modules, npm install/run) assumes the repo
REM root as its working directory, so move there first regardless of where
REM this .bat was launched from (double-click, a shortcut, another cwd).
cd /d "%~dp0.."

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
