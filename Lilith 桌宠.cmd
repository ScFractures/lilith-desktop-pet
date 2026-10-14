@echo off
setlocal
set "APPDIR=%~dp0LilithPet"
if not exist "%APPDIR%\node_modules\electron\dist\electron.exe" (
  echo Lilith Pet dependencies are not installed yet. Run:
  echo     cd LilithPet
  echo     npm install
  pause
  exit /b 1
)
start "" "%APPDIR%\node_modules\electron\dist\electron.exe" "%APPDIR%"
