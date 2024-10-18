import http2, { Http2SecureServer } from "node:http2";
import fs from "node:fs";
import path from "node:path";

class HlsDashServer {
  http2: Http2SecureServer;
  corsHeaders: {};
  constructor() {
    this.http2 = http2.createSecureServer({
      key: fs.readFileSync(path.join(__dirname, "..", "..", "..", "cert", "key.pem")),
      cert: fs.readFileSync(path.join(__dirname, "..", "..", "..", "cert", "cert.pem")),
    });
    this.corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
    };
  }

  start() {
    this.http2.listen(8443, () => {
      console.log("HLS-DASH SERVER RUNNING ON PORT 8443");
    });

    this.http2.on("stream", (stream, headers) => {
      let reqPath = headers[":path"];
      let method = headers[":method"];
      if (method && method == "OPTIONS") {
        stream.respond({ ":status": 204, ...this.corsHeaders });
        stream.end();
        return;
      }
      if (!reqPath) return this.notFound(stream);
      if (reqPath.endsWith(".m3u8")) {
        this.streamFile(reqPath, stream);
      } else if (reqPath.endsWith(".ts")) {
        this.streamFile(reqPath, stream);
      } else if (reqPath.endsWith(".m4s")) {
        this.streamFile(reqPath, stream);
      } else if (reqPath.endsWith(".mpd")) {
        this.streamFile(reqPath, stream);
      } else {
        this.notFound(stream);
      }
    });

    this.http2.on("sessionError", (err) => {
      console.log(err);
    });
  }

  stop() {
    this.http2.close();
  }

  streamFile(reqPath: string, stream: http2.ServerHttp2Stream) {
    let fullPath = path.join(__dirname, "..", "..", "..", "media", reqPath);
    let cntTyp = "";
    if (fullPath.endsWith(".m3u8")) {
      cntTyp = "application/vnd.apple.mpegURL";
    } else if (fullPath.endsWith(".ts")) {
      cntTyp = "video/mp2t";
    } else if (fullPath.endsWith(".mpd")) {
      cntTyp = "application/dash+xml";
    } else if (fullPath.endsWith(".m4s")) {
      cntTyp = "video/iso.segment";
    }

    if (fs.existsSync(fullPath)) {
      fs.readFile(fullPath, (err, data) => {
        if (err) return this.internalServerError(stream);
        stream.respond({
          status: 200,
          "content-type": cntTyp,
          ...this.corsHeaders,
        });
        stream.end(data);
      });
    } else {
      return this.notFound(stream);
    }
  }
  notFound(stream: http2.ServerHttp2Stream) {
    stream.respond({ status: 404 });
    stream.end("NOT FOUND");
  }
  internalServerError(stream: http2.ServerHttp2Stream) {
    stream.respond({ status: 500 });
    stream.end("INTERNAL SERVER ERROR");
  }
}

export default HlsDashServer;
