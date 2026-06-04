# Dockerfile for MR CRM
# Builds a lightweight container running the Node server included in the repo.

FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy project files
COPY . /app

# Ensure server-data exists (server will also create it at runtime if missing)
RUN mkdir -p /app/server-data

EXPOSE 3000

# Run server
CMD ["node", "server.js"]
