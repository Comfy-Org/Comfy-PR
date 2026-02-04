# Use official Bun image
FROM oven/bun:1.1.21-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --production --ignore-scripts

# Copy source code
COPY ../ .

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Run the webhook service
CMD ["bun", "bot/index.tsx"]