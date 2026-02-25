# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source
COPY src ./src

# Build the application (increase memory if build fails on Railway)
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
# Railway sets PORT at runtime; default for local Docker
ENV PORT=3001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Create uploads dir so static middleware has a valid path
RUN mkdir -p uploads

EXPOSE 3001

# Railway injects PORT; app reads process.env.PORT in main.ts
CMD ["node", "dist/main.js"]
