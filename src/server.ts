import Net from "node:net";
import tls from "node:tls";
import path from "node:path";
import RtmpConnectionPool from "./RtmpConnectionPool";
import fs from "node:fs";

// const tlsServer = tls.createServer(
//   {
//     key: fs.readFileSync(path.join(__dirname, "..", "cert", "privatekey.pem")),
//     cert: fs.readFileSync(path.join(__dirname, "..", "cert", "cert.pem")),
//   },
//   (socket) => {
//     const rtmpConnectionPool = new RtmpConnectionPool(socket);
//     rtmpConnectionPool.start();
//   }
// );

const server = Net.createServer((socket) => {
  const rtmpConnectionPool = new RtmpConnectionPool(socket);
  rtmpConnectionPool.start();
});

server.listen(1935, () => console.log("RTMP SERVER RUNNING ON PORT 1935"));
