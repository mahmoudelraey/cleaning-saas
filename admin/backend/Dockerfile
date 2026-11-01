# Build context is the repository root (the app needs the shared core module and the parent pom):
#   docker build -f admin/backend/Dockerfile .
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
COPY core core
COPY admin/backend/pom.xml admin/backend/
COPY portal/backend/pom.xml portal/backend/
COPY admin/backend/src admin/backend/src
RUN mvn -q -B -pl admin/backend -am -DskipTests package

# Run
FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 app && mkdir -p /app/data && chown app /app/data
WORKDIR /app
COPY --from=build /src/admin/backend/target/fieldops-backend-*.jar app.jar
USER app
EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -Duser.timezone=UTC"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
