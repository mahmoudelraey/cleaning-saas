# Build context is the repository root (the app needs the shared core module and the parent pom):
#   docker build -f portal/backend/Dockerfile .
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
COPY core core
COPY admin/backend/pom.xml admin/backend/
COPY portal/backend/pom.xml portal/backend/
COPY portal/backend/src portal/backend/src
RUN mvn -q -B -pl portal/backend -am -DskipTests package

# Run
FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 app
WORKDIR /app
COPY --from=build /src/portal/backend/target/fieldops-portal-backend-*.jar app.jar
USER app
EXPOSE 8090
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -Duser.timezone=UTC"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
