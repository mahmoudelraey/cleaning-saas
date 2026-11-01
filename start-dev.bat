@echo off
cd /d "%~dp0"
echo [1/6] Starting PostgreSQL in Docker...
docker compose up -d db || (echo Docker failed - is Docker Desktop running? & pause & exit /b 1)
echo [2/6] Building the shared core module...
call mvn -q -B -DskipTests install || (echo Maven build failed & pause & exit /b 1)
echo [3/6] Starting admin backend on http://localhost:8080 ...
start "FieldOps admin backend" cmd /k "cd /d %~dp0 && mvn -pl admin/backend spring-boot:run -Dspring-boot.run.profiles=local"
echo [4/6] Starting admin frontend on http://localhost:4200 ...
start "FieldOps admin frontend" cmd /k "cd /d %~dp0admin\frontend && (if not exist node_modules npm install) && npm start"
echo [5/6] Starting portal backend on http://localhost:8090 (after the admin backend has migrated the database)...
timeout /t 25 /nobreak > nul
start "FieldOps portal backend" cmd /k "cd /d %~dp0 && mvn -pl portal/backend spring-boot:run -Dspring-boot.run.profiles=local"
echo [6/6] Starting portal frontend on http://localhost:4300 ...
start "FieldOps portal frontend" cmd /k "cd /d %~dp0portal\frontend && (if not exist node_modules npx -y -p node@24.22.0 -p npm@10 -- npm install) && npm start"
echo.
echo Admin:  http://localhost:4200/signup
echo Portal: http://localhost:4300/p/YOUR-COMPANY-SLUG   (the slug is in Settings, booking link)
echo After changing code in core/, stop the backends and run this script again (it reinstalls core).
timeout /t 15
