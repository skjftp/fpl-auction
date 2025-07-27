FROM node:18-alpine

WORKDIR /app

# Install Python and build dependencies needed for node-gyp
RUN apk add --no-cache python3 make g++ 

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev || npm install

# Copy application code
COPY . .

# Create tmp directory for SQLite
RUN mkdir -p /tmp

# Use the PORT environment variable provided by Cloud Run
ENV PORT=8080
EXPOSE 8080

# Start the application
CMD ["node", "src/server.js"]