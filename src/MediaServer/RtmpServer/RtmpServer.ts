import Net from "node:net";
import RtmpSession from "./RtmpSession";
import os from "node:os";

class RtmpServer {
  server: Net.Server;
  constructor() {
    this.server = Net.createServer((socket) => {
      const session = new RtmpSession(socket);
      session.start();
    });
  }
  start() {
    this.server.listen(1935, () => console.log("RTMP SERVER STARTED ON PORT 1935"));
  }
  stop() {
    this.server.close();
  }
}

export default RtmpServer;
