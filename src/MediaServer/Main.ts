import RtmpServer from "./RtmpServer/RtmpServer";
import TransMuxingServer from "./TransmuxingServer/TransmuxingServer";

class Main {
  rtmpserver: RtmpServer;
  transMuxingServer: TransMuxingServer;
  constructor() {
    this.rtmpserver = new RtmpServer();
    this.rtmpserver.run();

    this.transMuxingServer = new TransMuxingServer();
    this.transMuxingServer.run();
  }
  run() {}
}

export default Main;
