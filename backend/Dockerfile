# Backend Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install netcat for database connectivity checks
RUN apk add --no-cache netcat-openbsd bash

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy application code
COPY . .

# Expose the API port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Make startup script executable
RUN chmod +x start.sh

# Start the application
CMD ["sh", "start.sh"]
