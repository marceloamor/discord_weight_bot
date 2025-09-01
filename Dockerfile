# Use the official Node.js image
FROM node:18-slim

# Create and change to the app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy local code to the container image
COPY . .

# Copy credentials and config files
COPY credentials.json .
COPY src/user-mappings.json ./dist/
COPY src/user-data.json ./dist/

# Build the application
RUN npm run build

# Expose the port the app runs on
EXPOSE 8080

# Start the application
CMD [ "npm", "start" ]