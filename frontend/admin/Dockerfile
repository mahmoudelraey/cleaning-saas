# Build
FROM node:24-alpine AS build
WORKDIR /src
# Same npm as package.json "packageManager"
RUN npm install -g npm@10.9.4
# .npmrc carries legacy-peer-deps=true, which package-lock.json was written with; without it `npm ci` wants peer deps the lock doesn't have
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

# Serve (nginx proxies /api to the backend container)
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
