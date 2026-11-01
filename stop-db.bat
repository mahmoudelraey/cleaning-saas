@echo off
cd /d "%~dp0"
docker compose stop db
echo Close the "FieldOps backend" and "FieldOps frontend" windows to stop those.
pause
