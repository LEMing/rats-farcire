# Server Dockerfile for Cloud Run
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy server and shared code
COPY server/ ./server/
COPY shared/ ./shared/
COPY tsconfig.server.json ./

# Install tsx for running TypeScript
RUN npm install tsx

# Expose port (Cloud Run uses PORT env variable)
EXPOSE 8080

# Set environment variable for Cloud Run
ENV PORT=8080

# Start server
CMD ["npx", "tsx", "server/index.ts"]
