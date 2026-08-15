FROM node:22-alpine
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/diagnosis/package.json packages/diagnosis/package.json
COPY packages/telemetry/package.json packages/telemetry/package.json
RUN npm ci
COPY apps/api apps/api
COPY packages packages
WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npx", "tsx", "src/index.ts"]
