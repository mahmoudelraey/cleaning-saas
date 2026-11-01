@echo off
cd /d "%~dp0"
(
echo === java
java -version 2>&1
echo === mvn
call mvn -v 2>&1
echo === node
node -v 2>&1
echo === npm
call npm -v 2>&1
echo === docker
docker version --format "{{.Server.Version}}" 2>&1
echo === psql
where psql 2>&1
echo === JAVA_HOME=%JAVA_HOME%
dir /b "C:\Program Files\Java" 2>&1
dir /b "C:\Program Files\Eclipse Adoptium" 2>&1
echo === DONE
) > tools-check.txt
