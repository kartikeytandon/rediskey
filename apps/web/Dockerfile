FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/diagnosis/package.json packages/diagnosis/package.json
COPY packages/telemetry/package.json packages/telemetry/package.json
RUN npm ci
COPY apps/web apps/web
COPY packages packages
WORKDIR /repo/apps/web
ARG VITE_SITE_URL=https://baltan.xyz
ARG VITE_CALENDLY_URL=
ARG VITE_AGENT_IMAGE=
ARG VITE_GOOGLE_SITE_VERIFICATION=
ENV VITE_SITE_URL=$VITE_SITE_URL \
    VITE_CALENDLY_URL=$VITE_CALENDLY_URL \
    VITE_AGENT_IMAGE=$VITE_AGENT_IMAGE \
    VITE_GOOGLE_SITE_VERIFICATION=$VITE_GOOGLE_SITE_VERIFICATION
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
