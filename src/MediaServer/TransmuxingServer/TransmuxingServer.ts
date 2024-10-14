import fs from "node:fs";
import * as essentials from "../Essentials";
import TransMuxingSession from "./TransMuxingSession";

class TransMuxingServer {
  transSessions = new Map();
  constructor() {}

  run() {
    try {
      if (!fs.existsSync("./media")) fs.mkdirSync("./media");
      // fs.accessSync("./media");
    } catch (error) {
      console.log(error);
    }
    console.log("TRANSMUXING SERVER RUNNING");
    essentials.streamEvents.on("postPublish", this.onPostPublish.bind(this));
  }

  onPostPublish(id: string, streamPath: string) {
    let app_name = streamPath.split("/");
    let conf = {} as any;
    conf.mediaroot = "./media";
    conf.ffmpeg = "C:/ffmpeg/bin/ffmpeg.exe";
    conf.streamPath = streamPath;
    conf.rtmpPort = 1935;
    conf.app = app_name[1];
    conf.name = app_name[2];
    let session = new TransMuxingSession(conf);
    session.on("end", () => {
      this.transSessions.delete(id);
    });
    this.transSessions.set(id, this);
    session.run();
  }
}

export default TransMuxingServer;
