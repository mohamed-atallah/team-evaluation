# Use Node.js base image
FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Set working directory
WORKDIR /app

# Install dependencies first (for caching)
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Expose the port
EXPOSE 3001

# Command to run the application
CMD npx prisma db push --skip-generate && npm start
