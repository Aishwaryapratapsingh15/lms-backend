FROM node:24-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder

COPY prisma ./prisma
RUN npx prisma generate
COPY nest-cli.json tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runner

ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN chown -R node:node /app

USER node
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
