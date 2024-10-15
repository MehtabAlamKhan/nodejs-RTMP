import Net from "node:net";
import RtmpSession from "./RtmpSession";

class RtmpServer {
  server: Net.Server;
  constructor() {
    this.server = Net.createServer((socket) => {
      const session = new RtmpSession(socket);
      session.start();
    });
  }
  run() {
    this.server.listen(1935, () =>
      console.log("RTMP SERVER STARTED ON PORT 1935")
    );
  }
}

export default RtmpServer;
