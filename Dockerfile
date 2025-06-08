# Stage 1: Development with Dependencies
FROM node:20-slim AS dev

# Install Python and build-essential for node-gyp dependencies
RUN apt-get update && \
    apt-get install -y python3 build-essential && \
    ln -s /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all dependencies
COPY package*.json ./
RUN npm ci

# Stage 2: Runtime Lightweight Image
FROM node:20-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Set up a non-root user
RUN groupmod -g 1001 node \
    && usermod -u 1001 -g 1001 node

# Copy installed dependencies and source code from the dev stage
COPY --chown=node:node --from=dev /app/node_modules node_modules
COPY --chown=node:node . .

USER node
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
