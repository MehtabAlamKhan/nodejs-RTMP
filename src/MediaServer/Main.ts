import RtmpServer from "./RtmpServer/RtmpServer";
import TransMuxingServer from "./TransMuxingServer/TransMuxingServer";
import HlsServer from "./HlsDashServer/HlsDashServer";

class Main {
  private rtmpserver: RtmpServer;
  private transMuxingServer: TransMuxingServer;
  private hlsDashServer: HlsServer;
  private config: any;
  constructor(config: any = {}) {
    this.config = config;
    this.rtmpserver = new RtmpServer();
    this.transMuxingServer = new TransMuxingServer();
    this.hlsDashServer = new HlsServer();
  }
  start() {
    this.rtmpserver.start();
    this.transMuxingServer.start();
    this.hlsDashServer.start();

    process.on("uncaughtException", (err) => {
      console.log("uncaughtException", err);
    });

    process.on("SIGINT", () => {
      process.exit();
    });
  }
  stop() {
    this.rtmpserver.stop();
    this.transMuxingServer.stop();
    this.hlsDashServer.stop();
  }
}

export default Main;
