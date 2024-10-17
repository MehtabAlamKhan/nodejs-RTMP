import { mkdir } from "fs";
import { EventEmitter } from "stream";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as essentials from "../Essentials";

class TransMuxingSession extends EventEmitter {
  mediaroot = "";
  ffmpegPath = "";
  streamPath = "";
  rtmpPort = 0;
  app = "";
  name = "";
  ffmpegExe!: ChildProcessWithoutNullStreams;
  constructor(conf: any) {
    super();
    this.mediaroot = conf.mediaroot;
    this.ffmpegPath = conf.ffmpeg;
    this.streamPath = conf.streamPath;
    this.rtmpPort = conf.rtmpPort;
    this.app = conf.app;
    this.name = conf.name;
  }

  run() {
    let inPath = `rtmp://127.0.0.1:${this.rtmpPort}/${this.app}/${this.name}`;
    let outPath = `${this.mediaroot}/${this.app}/${this.name}`;

    let hlsIndexFile = "index.m3u8";
    let hlsFlags = `[hls_time=2:hls_list_size=3:hls_flags=delete_segments]${outPath}/${hlsIndexFile}|`;

    let argv = `-y -i ${inPath} -c:v copy -c:a aac -ab 64k -ac 1 -ar 44100 -f tee -map 0:a? -map 0:v? ${hlsFlags}`;
    let argvArray = argv.split(" ");

    this.ffmpegExe = spawn(this.ffmpegPath, argvArray);
    this.ffmpegExe.on("error", (e) => {
      console.log("FF ERR: ", e);
    });

    this.ffmpegExe.stdout.on("data", (data: Buffer) => {
      console.log("FF DATA OUT: ", data.toString("utf-8"));
    });

    this.ffmpegExe.stderr.on("data", (data: Buffer) => {
      console.log("FF DATA ERR: ", data.toString("utf-8"));
    });

    this.ffmpegExe.on("close", (code) => {
      console.log("TRANSMUX ENDED - ", code);
    });
  }
  end(id: string) {
    this.ffmpegExe.kill();
  }
}

export default TransMuxingSession;
