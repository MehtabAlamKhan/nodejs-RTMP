import fs from "node:fs";
import * as essentials from "../Essentials";
import TransMuxingSession from "./TransMuxingSession";

class TransMuxingServer {
  transSessions = new Map<string, TransMuxingSession>();
  constructor() {}

  start() {
    try {
      if (!fs.existsSync("./media")) fs.mkdirSync("./media");
      // fs.accessSync("./media");
    } catch (error) {
      console.log(error);
    }
    console.log("TRANSMUXING SERVER RUNNING");

    essentials.streamEvents.on("postStreamStart", this.onPostStreamStart.bind(this));
    essentials.streamEvents.on("postStreamEnd", this.onPostStreamEnd.bind(this));
  }
  stop() {}

  onPostStreamStart(id: string, streamPath: string) {
    let app_name = streamPath.split("/");
    let conf = {} as any;
    conf.mediaroot = "./media";
    conf.ffmpeg = "C:/ffmpeg/bin/ffmpeg.exe";
    conf.streamPath = streamPath;
    conf.rtmpPort = 1935;
    conf.app = app_name[1];
    conf.name = app_name[2];
    let session = new TransMuxingSession(conf);
    this.transSessions.set(id, session);
    session.run();
  }
  onPostStreamEnd(id: string) {
    let session = this.transSessions.get(id);
    if (session) {
      session.end(id);
      this.transSessions.delete(id);
    }
  }
}

export default TransMuxingServer;
