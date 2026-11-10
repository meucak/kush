@echo off
:: ==============================================================================
:: kush — Windows Client Launcher & Management CLI (Tailscale & LAN)
:: ==============================================================================
title kush LAN

set SERVER_URL=http://100.69.155.110:8088

:: Test Tailscale connection, fallback to local LAN IP if offline
curl.exe -s --connect-timeout 1 %SERVER_URL%/api/info >nul 2>&1
if errorlevel 1 (
    curl.exe -s --connect-timeout 1 http://192.168.1.102:8088/api/info >nul 2>&1
    if not errorlevel 1 (
        set SERVER_URL=http://192.168.1.102:8088
    ) else (
        set SERVER_URL=http://192.168.1.27:8088
    )
)

if "%1"=="--resetlog" (
    echo ==================================================
    echo   kush -- Sohbet ve Log Sifirlama
    echo ==================================================
    echo Sunucu kayitlari sifirlaniyor...
    curl.exe -s -X POST %SERVER_URL%/api/logs/reset
    echo.
    echo Log kayitlari basariyla sifirlandi!
    pause
    exit /b
)

if "%1"=="--help" (
    echo Kullanım:
    echo   kush-windows.bat            : Donanım optimize pencerede başlatır
    echo   kush-windows.bat --resetlog : Sohbet ve logları sıfırlar
    pause
    exit /b
)

echo Starting kush at %SERVER_URL% ...
set LOW_MEM_FLAGS=--disable-background-networking --disable-sync --disable-extensions --no-default-browser-check --disk-cache-size=10485760

start msedge.exe --app="%SERVER_URL%" %LOW_MEM_FLAGS% 2>nul || start chrome.exe --app="%SERVER_URL%" %LOW_MEM_FLAGS% 2>nul || start "" "%SERVER_URL%"
exit
