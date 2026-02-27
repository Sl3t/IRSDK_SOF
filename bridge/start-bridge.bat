@echo off
REM =========================================================================
REM  IRSDK SOF Bridge — Windows Launcher
REM  Double-click this file to start the bridge.
REM  The WebSocket server will listen on port 8182.
REM  Press Ctrl+C to stop.
REM =========================================================================

title IRSDK SOF Bridge

echo.
echo =============================================
echo   IRSDK SOF Bridge
echo   WebSocket server on ws://0.0.0.0:8182
echo =============================================
echo.

REM Navigate to the bridge directory (where this .bat file lives)
cd /d "%~dp0"

REM Check that Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         Please install Node.js v18+ from https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Display Node.js version
echo Node.js version:
node -v
echo.

REM Install dependencies if node_modules does not exist
if not exist "node_modules\" (
    echo Installing dependencies...
    echo This may take a minute (native C++ addon build required^).
    echo.
    call npm run setup
    echo.
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed. Check the errors above.
        echo         Make sure you have Visual Studio Build Tools installed.
        echo         Run: npm install -g windows-build-tools
        echo.
        pause
        exit /b 1
    )
)

REM Start the bridge
echo Starting bridge...
echo.
node server.js

REM If the process exits, pause so the user can see any error messages
echo.
echo Bridge stopped.
pause
