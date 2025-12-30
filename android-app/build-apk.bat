@echo off
setlocal

echo ===============================================
echo Hospital Management - Quick Build Script
echo ===============================================
echo.

REM Force set Java path (override VS Code Java extension)
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot"
set "PATH=%JAVA_HOME%\bin;%PATH%"

REM Clear any interfering environment variables
set JAVA_TOOL_OPTIONS=

REM Verify Java is accessible
echo Verifying Java installation...
"%JAVA_HOME%\bin\java.exe" -version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Java not found at: %JAVA_HOME%
    echo Please install Java 17 or update the path in this script.
    pause
    exit /b 1
)
echo Java OK: %JAVA_HOME%
echo.

echo [Step 1/3] Installing/refreshing dependencies...
call gradlew.bat --refresh-dependencies
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to download dependencies!
    echo.
    pause
    exit /b 1
)

echo.
echo [Step 2/3] Syncing project...
call gradlew.bat clean
echo.

echo [Step 3/3] Building APK...
call gradlew.bat assembleDebug

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===============================================
    echo BUILD SUCCESSFUL!
    echo ===============================================
    echo APK Location: app\build\outputs\apk\debug\app-debug.apk
    echo.
) else (
    echo.
    echo ===============================================
    echo BUILD FAILED!
    echo ===============================================
    echo Check errors above.
    echo.
)

pause
