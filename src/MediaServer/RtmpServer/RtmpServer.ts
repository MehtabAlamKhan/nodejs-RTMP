import Net from "node:net";
import RtmpSession from "./RtmpSession";

class RtmpServer {
  server: Net.Server;
  constructor() {
    this.server = Net.createServer((socket) => {
      let session: RtmpSession | null = new RtmpSession(socket);
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
