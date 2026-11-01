
echo [1/3] Starting PostgreSQL in Docker...
docker compose up -d db || (echo Docker failed - is Docker Desktop running? & pause & exit /b 1)
echo [2/3] Starting backend on http://localhost:8080 ...
start "FieldOps backend" cmd /k "cd /d %~dp0backend && mvn spring-boot:run -Dspring-boot.run.profiles=local"
echo [3/3] Starting frontend on http://localhost:4200 ...
start "FieldOps frontend" cmd /k "cd /d %~dp0frontend && (if not exist node_modules npm install) && npm start"
echo.
echo Backend and frontend are starting in their own windows.
echo When the frontend window shows http://localhost:4200, open http://localhost:4200/signup
timeout /t 15
