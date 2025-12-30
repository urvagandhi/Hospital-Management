@echo off
echo ===============================================
echo Hospital Management - Android Build Script
echo ===============================================
echo.

REM Set Java path from gradle.properties
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set JAVA_TOOL_OPTIONS=

echo [1/4] Verifying Java installation...
java -version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Java not found! Please install JDK 17.
    pause
    exit /b 1
)
echo Java verified successfully.
echo.

echo [2/4] Installing dependencies...
call gradlew.bat --refresh-dependencies
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to download dependencies!
    pause
    exit /b 1
)
echo.

echo [3/4] Cleaning previous build...
call gradlew.bat clean
echo.

echo [4/4] Building APK...
call gradlew.bat assembleDebug

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===============================================
    echo BUILD SUCCESSFUL!
    echo ===============================================
    echo.
    echo APK Location:
    echo app\build\outputs\apk\debug\app-debug.apk
    echo.
) else (
    echo.
    echo ===============================================
    echo BUILD FAILED!
    echo ===============================================
    echo Please check the errors above.
    echo.
)

pause
