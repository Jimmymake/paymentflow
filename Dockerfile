# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app

# Copy everything needed for frontend build
COPY package*.json ./
COPY vite.config.js ./
COPY index.html ./
COPY src ./src
COPY public ./public

RUN npm install
RUN npm run build

# Stage 2: Setup backend + serve frontend
FROM node:20-alpine
WORKDIR /app

# Copy backend files
COPY package*.json ./
COPY server.js ./

# Install backend dependencies inside the container
RUN npm install --production

# Copy frontend build
COPY --from=frontend-build /app/dist ./dist

# Expose backend port
EXPOSE 3001

# Start backend server
CMD ["node", "server.js"]
