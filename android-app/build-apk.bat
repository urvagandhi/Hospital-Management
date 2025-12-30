@echo off
setlocal enabledelayedexpansion
REM Unset JAVA_HOME to use the one from gradle.properties
set JAVA_HOME=
REM Also unset JAVA_TOOL_OPTIONS if it's interfering
set JAVA_TOOL_OPTIONS=
REM Run the build
call gradlew.bat assembleDebug
