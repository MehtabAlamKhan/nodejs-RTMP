import { spawn } from "node:child_process";
import Crypto from "node:crypto";
export const generateID = () => {
  return Crypto.randomBytes(16).toString("hex").slice(0, 8).toUpperCase();
};

export function getFfmpegVersion(fpath: string = "") {
  return new Promise((resolve, reject) => {
    let ffmpeg_exec = spawn(fpath, ["-version"]);
    let res = "";
    ffmpeg_exec.stdout.on("data", (chunk) => {
      res += chunk;
    });
    ffmpeg_exec.on("error", (err) => {
      reject(err);
    });
    ffmpeg_exec.on("close", (code) => {
      resolve(res);
    });
  });
}
