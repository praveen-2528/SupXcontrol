@echo off
title SuperXontrol Server
color 0B

echo.
echo   ========================================
echo          SuperXontrol v1.0
echo     Phone to Laptop Remote Controller
echo   ========================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Python is not installed or not in PATH.
    echo  Please install Python 3.8+ from https://python.org
    echo.
    pause
    exit /b 1
)

:: Install dependencies
echo  [1/2] Installing dependencies...
pip install -r server\requirements.txt --quiet 2>nul

echo  [2/2] Starting SuperXontrol server...
echo.
echo  ========================================
echo   Make sure your phone is on the SAME
echo   WiFi network as this laptop!
echo  ========================================
echo.

:: Start the server
cd server
python main.py

:: If server exits, pause so user can see errors
echo.
echo  Server stopped. Press any key to exit.
pause >nul
