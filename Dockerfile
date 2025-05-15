# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies)
RUN npm install --include=dev

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Serve stage
FROM node:20-alpine

WORKDIR /app

# Install serve
RUN npm install -g serve

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Expose port 3000
EXPOSE 3000

# Start serve - listen on all interfaces
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:3000"]
