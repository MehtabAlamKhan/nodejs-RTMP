#STAGE 1: Install dependencies and build the app
FROM arm64v8/node:14 AS build 
WORKDIR /usr/app/nodejs-Rtmp
COPY . .
RUN npm install
RUN npm run build


#STAGE 2: Create the production image
FROM arm64v8/node:14
WORKDIR /usr/app/nodejs-Rtmp
COPY --from=build /usr/app/nodejs-Rtmp/dist ./dist
COPY --from=build /usr/app/nodejs-Rtmp/node_modules ./node_modules
COPY --from=build /usr/app/nodejs-Rtmp/package*.json ./

EXPOSE 1935

CMD ["npm", "run", "start"]
