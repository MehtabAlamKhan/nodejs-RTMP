import { mkdir } from "fs";
import { EventEmitter } from "stream";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";

class TransMuxingSession extends EventEmitter {
  mediaroot = "";
  ffmpeg = "";
  streamPath = "";
  rtmpPort = 0;
  app = "";
  name = "";
  ffmpegExe!: ChildProcessWithoutNullStreams;
  constructor(conf: any) {
    super();
    this.mediaroot = conf.mediaroot;
    this.ffmpeg = conf.ffmpeg;
    this.streamPath = conf.streamPath;
    this.rtmpPort = conf.rtmpPort;
    this.app = conf.app;
    this.name = conf.name;
  }

  run() {
    let inPath = `rtmp://127.0.0.1:${this.rtmpPort}/${this.app}/${this.name}`;
    let outPath = `${this.mediaroot}/${this.app}/${this.name}`;

    let hlsIndexFile = "index.m3u8";
    let hlsFlags = `[hls_time=2:hls_list_size=3:hls_flags=delete_segments]${outPath}/${hlsIndexFile}`;

    let argv = `-y -i ${inPath} -c:v copy -c:a aac -ab 64k -ac 1 -ar 4410 -f tee -map 0:a? -map 0:v? ${hlsFlags}`;
    let argvArray = argv.split(" ");

    this.ffmpegExe = spawn(this.ffmpeg, argvArray);

    // this.ffmpegExe.on("")
  }
}

export default TransMuxingSession;
