import RtmpServer from "./RtmpServer/RtmpServer";
import TransMuxingServer from "./TransMuxingServer/TransMuxingServer";

class Main {
  private rtmpserver: RtmpServer;
  private transMuxingServer: TransMuxingServer;
  private config: any;
  constructor(config: any = {}) {
    this.config = config;
    this.rtmpserver = new RtmpServer();
    this.transMuxingServer = new TransMuxingServer();
  }
  start() {
    this.rtmpserver.start();
    this.transMuxingServer.start();
  }
  stop() {
    this.rtmpserver.stop();
    this.transMuxingServer.stop();
  }
}

export default Main;
