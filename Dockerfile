#STAGE 1: Install dependencies and build the app
FROM arm64v8/node:14 AS build 
WORKDIR /usr/app/nodejs-Rtmp
COPY . .
RUN npm install
RUN npm run build


#STAGE 2: Create the production image
FROM arm64v8/node:14

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /usr/app/nodejs-Rtmp
COPY --from=build /usr/app/nodejs-Rtmp/dist ./dist
COPY --from=build /usr/app/nodejs-Rtmp/node_modules ./node_modules
COPY --from=build /usr/app/nodejs-Rtmp/package*.json ./
COPY --from=build /usr/app/nodejs-Rtmp/cert ./cert

EXPOSE 1935
EXPOSE 443

CMD ["npm", "run", "start"]
