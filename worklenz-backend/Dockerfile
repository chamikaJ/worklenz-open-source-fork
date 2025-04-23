# Use the official Node.js 20 image as a base
FROM node:20

# Create and set the working directory
WORKDIR /app

# Install global dependencies
RUN npm install -g ts-node typescript grunt grunt-cli

# Install PostgreSQL client for migrations
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install app dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Make migration script executable
RUN chmod +x ./scripts/run-migrations.sh

# Run the build script to compile TypeScript to JavaScript
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Create startup script
RUN echo '#!/bin/bash\n\
# Run database migrations\n\
./scripts/run-migrations.sh\n\
\n\
# Start the application\n\
exec npm start' > /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Set the entry point to our startup script
ENTRYPOINT ["/app/docker-entrypoint.sh"]