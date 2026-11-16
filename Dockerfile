FROM node:22-alpine

WORKDIR /app

# Install curl for container health checks
RUN apk add --no-cache curl

# Copy dependency specifications
COPY package.json ./

# Install production dependencies
RUN npm install --omit=dev --omit=optional

# Copy application source files
COPY . .

# Ensure data directory exists
RUN mkdir -p data

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
