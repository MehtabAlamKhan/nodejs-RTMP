import Net from "node:net";
import RtmpConnectionPool from "./RtmpConnectionPool";

const server = Net.createServer((socket) => {
  const rtmpConnectionPool = new RtmpConnectionPool(socket);
  rtmpConnectionPool.start();
});

server.listen(1935, () => console.log("RTMP SERVER RUNNING ON PORT 1935"));
