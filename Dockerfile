# Use the official Node.js runtime as the base image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies and clean npm cache
RUN npm install && \
    npm cache clean --force && \
    rm -rf /root/.npm/_cacache

# Copy the rest of the application code
COPY . .

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
USER nodejs

# Expose the port the app runs on
EXPOSE 3000

# Command to run the app
CMD ["npm", "start"]
