import Net from "node:net";
import RtmpConnectionPool from "./RtmpConnectionPool";

class RtmpServer {
  server: Net.Server;
  constructor() {
    this.server = Net.createServer((socket) => {
      const rtmpConnectionPool = new RtmpConnectionPool(socket);
      rtmpConnectionPool.start();
    });
  }
  run() {
    this.server.listen(1935, () =>
      console.log("RTMP SERVER STARTED ON PORT 1935")
    );
  }
}

export default RtmpServer;
