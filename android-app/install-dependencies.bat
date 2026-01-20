@echo off
setlocal enabledelayedexpansion

echo ===============================================
echo Installing Android Dependencies
echo ===============================================
echo.

REM Set Java path explicitly
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set JAVA_TOOL_OPTIONS=

echo Checking Java installation...
java -version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Java 17 not found!
    echo Please install Java 17 from: https://adoptium.net/
    pause
    exit /b 1
)
echo.

echo Downloading and installing all dependencies...
echo This may take a few minutes on first run...
echo.

call gradlew.bat --refresh-dependencies dependencies

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===============================================
    echo Dependencies installed successfully!
    echo ===============================================
    echo.
    echo You can now run: build-apk.bat
    echo.
) else (
    echo.
    echo ===============================================
    echo Dependency installation failed!
    echo ===============================================
    echo Check your internet connection and try again.
    echo.
)

pause
