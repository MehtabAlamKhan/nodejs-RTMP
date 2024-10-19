const AudioCodeNames: { [key: number]: string } = {
  0: "", // 0: Reserved
  1: "ADPCM", // 1: ADPCM
  2: "MP3", // 2: MP3
  3: "LinearLE", // 3: Linear PCM (Little Endian)
  4: "Nellymoser16", // 4: Nellymoser 16 kHz mono
  5: "Nellymoser8", // 5: Nellymoser 8 kHz mono
  6: "Nellymoser", // 6: Nellymoser
  7: "G711A", // 7: G.711 A-law
  8: "G711U", // 8: G.711 mu-law
  9: "", // 9: Reserved
  10: "AAC", // 10: AAC
  11: "Speex", // 11: Speex
  12: "", // 12: Reserved
  13: "OPUS", // 13: Opus
  14: "MP3-8K", // 14: MP3 8 kHz
  15: "DeviceSpecific", // 15: Device-specific sound
  16: "Uncompressed", // Uncompressed audio
};

const AudioSampleRates: { [key: number]: number } = {
  0: 5512,
  1: 11025,
  2: 22050,
  3: 44100,
};

const VideoCodecNames: { [key: number]: string } = {
  1: "Jpeg",
  2: "Sorenson-H263",
  3: "ScreenVideo",
  4: "On2-VP6",
  5: "On2-VP6-Alpha",
  6: "ScreenVideo2",
  7: "H264",
  12: "H265",
  13: "AV1",
  14: "VP09",
};

function codecSpecificDetails(data: Buffer, codecId: number) {
  if (codecId === 7) return readH264details(data);
  if (codecId === 12) return readHEVCdetails(data);
  if (codecId === 13) return readAV1details(data);
  if (codecId === 14) return readVP9details(data);
}

function readH264details(data: Buffer) {
  let bitOp = new BitOperations(data);
  let offSet = 0;
  let version = bitOp.read(offSet, 2);
  offSet += 2;
  let padding = bitOp.read(offSet++, 1);
  let extension = bitOp.read(offSet++, 1);
  let conSourceCount = bitOp.read(offSet, 4);
  offSet += 4;
  let marker = bitOp.read(offSet++, 1);
  let paloadType = bitOp.read(offSet, 7);
  offSet += 7;
  let seqNo = bitOp.read(offSet, 16);
  offSet += 16;
  let timeStamp = bitOp.read(offSet, 32);
  offSet += 32;
}
function readHEVCdetails(data: Buffer) {}
function readAV1details(data: Buffer) {}
function readVP9details(data: Buffer) {}

class BitOperations {
  totalLength: number;
  buffer: Buffer;
  constructor(data: Buffer) {
    this.buffer = data;
    this.totalLength = data.length;
  }

  read(startBit: number, len: number) {
    let byteOffset = Math.floor(startBit / 8);
    let bitOffSet = startBit % 8;
    let value = 0;
    for (let i = 0; i < len; i++) {
      let byte = this.buffer[byteOffset];
      let bit = (byte >> (7 - bitOffSet)) & 1;
      value = (value << 1) | bit;

      if (bitOffSet === 8) {
        bitOffSet = 0;
        byteOffset++;
      }
    }
    return value;
  }
}

export { AudioCodeNames, AudioSampleRates, VideoCodecNames, codecSpecificDetails };
