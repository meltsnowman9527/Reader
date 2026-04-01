@echo off
cd /d "%~dp0"

echo Starting manga-reader...
call npm start
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Start failed. Exit code: %EXIT_CODE%
)

echo.
echo Press any key to close...
pause >nul
