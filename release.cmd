@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\release.ps1" %*
if errorlevel 1 (
  echo.
  echo Release failed.
  pause
  exit /b 1
)
echo.
echo Release finished.
pause
