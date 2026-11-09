FROM node:22-alpine AS build
WORKDIR /src
# Same npm as package.json "packageManager", so `npm ci` reads package-lock.json the way it was written
RUN npm install -g npm@10.9.4
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/portal/browser /usr/share/nginx/html
EXPOSE 80
