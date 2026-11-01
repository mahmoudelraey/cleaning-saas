# Build context is the backend folder (the app needs the parent pom and the core module):
#   docker build -f admin/Dockerfile backend      (from the repository root)
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
COPY core core
COPY admin/pom.xml admin/
COPY portal/pom.xml portal/
COPY admin/src admin/src
RUN mvn -q -B -pl admin -am -DskipTests package

# Run
FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 app && mkdir -p /app/data && chown app /app/data
WORKDIR /app
COPY --from=build /src/admin/target/fieldops-admin-*.jar app.jar
USER app
EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -Duser.timezone=UTC"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
