# Stage 1: Build frontend
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm install --workspace=client --workspace=server
COPY . .
RUN npm run build --workspace=client

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/package.json ./
RUN npm install --workspace=server --omit=dev
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "server/src/index.js"]
