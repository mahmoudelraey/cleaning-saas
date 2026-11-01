@echo off
cd /d "%~dp0"
docker compose stop db
echo Close the four "FieldOps ..." windows to stop the apps.
pause
