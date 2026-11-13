ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine
WORKDIR /app
ADD server ./server
ADD client ./client
ADD package* ./
ADD node_modules ./node_modules
EXPOSE 3000
ENTRYPOINT [ "npm", "start" ]
