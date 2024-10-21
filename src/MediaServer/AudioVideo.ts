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

const H264Profiles: { [key: number]: string } = {
  66: "Baseline",
  74: "Constrained Baseline",
  77: "Main",
  88: "Extended",
  100: "High",
  110: "High 10",
  122: "High 4:2:2",
  244: "High 4:4:4 Predictive",
  106: "High Intra",
  102: "Scalable Baseline",
  134: "Scalable High",
  128: "Stereo High",
  118: "Multiview High",
};

function codecSpecificDetails(data: Buffer, codecId: number) {
  if (codecId === 7) return readH264details(data);
  if (codecId === 12) return readHEVCdetails(data);
  if (codecId === 13) return readAV1details(data);
  if (codecId === 14) return readVP9details(data);
}

function readH264details(data: Buffer) {
  let details = {
    level: 0,
    height: 0,
    refFrames: 0,
    width: 0,
    profile: "",
  };
  let bitOp = new BitOperations(data);
  let offSet = 0; //represent bits

  // //NAL header 8 bits
  // let fobiddenZeroBit = bitOp.read(true, 1);
  // let nalRefIdc = bitOp.read(true, 2);
  // let nalType = bitOp.read(true, 5);

  //skip 5 bytes since it indicates the begining of nal unit
  bitOp.read(true, 40);

  let prfileIdc = bitOp.read(true, 8);
  let constFlags = bitOp.read(true, 8);
  let levelIdc = bitOp.read(true, 8);
  let nalUnit = bitOp.read(true, 8);
  let numberOfSpsUnits = bitOp.read(true, 8) & 31;

  //atleast 1 unit should present to decode details
  if (numberOfSpsUnits == 0) {
    return details;
  }
  /* nal size */
  bitOp.read(true, 16);

  //if not 103 then no SEI
  if (bitOp.read(true, 8) != 0x67) {
    return details;
  }

  //profileIdc, flags, levelIdc
  let profileIdc = bitOp.read(true, 8);
  details.profile = H264Profiles[profileIdc];
  bitOp.read(true, 8);
  details.level = bitOp.read(true, 8);

  /* SPS id */
  bitOp.read_golomb();

  if (
    profileIdc == 100 ||
    profileIdc == 110 ||
    profileIdc == 122 ||
    profileIdc == 244 ||
    profileIdc == 44 ||
    profileIdc == 83 ||
    profileIdc == 86 ||
    profileIdc == 118
  ) {
    let chromaFmtIdc = bitOp.read_golomb();

    if (chromaFmtIdc == 3) {
      bitOp.read(true, 1);
    }

    /* bit depth luma - 8 */
    bitOp.read_golomb();
    /* bit depth chroma - 8 */
    bitOp.read_golomb();
    /* qpprime y zero transform bypass */
    bitOp.read(true, 1);
    /* seq scaling matrix present */
    if (bitOp.read(true, 1)) {
      for (let n = 0; n < (chromaFmtIdc != 3 ? 8 : 12); n++) {
        /* seq scaling list present */
        if (bitOp.read(true, 1)) {
        }
      }
    }
  }

  /* log2 max frame num */
  bitOp.read_golomb();

  /* pic order cnt type */
  switch (bitOp.read_golomb()) {
    case 0:
      /* max pic order cnt */
      bitOp.read_golomb();
      break;

    case 1:
      /* delta pic order alwys zero */
      bitOp.read(true, 1);
      /* offset for non-ref pic */
      bitOp.read_golomb();
      /* offset for top to bottom field */
      bitOp.read_golomb();
      /* num ref frames in pic order */
      let noOfRefFrames = bitOp.read_golomb();

      for (let n = 0; n < noOfRefFrames; n++) {
        /* offset for ref frame */
        bitOp.read_golomb();
      }
  }

  /* num ref frames */
  details.refFrames = bitOp.read_golomb();

  /* gaps in frame num allowed */
  bitOp.read(true, 1);
  let width = bitOp.read_golomb();
  let height = bitOp.read_golomb();
  let frame_mbs_only = bitOp.read(true, 1);

  if (!frame_mbs_only) {
    /* mbs adaprive frame field */
    bitOp.read(true, 1);
  }
  /* direct 8x8 inference flag */
  bitOp.read(true, 1);

  let crop_left, crop_right, crop_top, crop_bottom;
  if (bitOp.read(true, 1)) {
    crop_left = bitOp.read_golomb();
    crop_right = bitOp.read_golomb();
    crop_top = bitOp.read_golomb();
    crop_bottom = bitOp.read_golomb();
  } else {
    crop_left = 0;
    crop_right = 0;
    crop_top = 0;
    crop_bottom = 0;
  }
  details.level = details.level / 10.0;
  details.width = (width + 1) * 16 - (crop_left + crop_right) * 2;
  details.height = (2 - frame_mbs_only) * (height + 1) * 16 - (crop_top + crop_bottom) * 2;
  return details;
}

function readHEVCdetails(data: Buffer) {}
function readAV1details(data: Buffer) {}
function readVP9details(data: Buffer) {}

class BitOperations {
  totalLength: number;
  buffer: Buffer;
  startBit: number;
  outOfRange: boolean;
  constructor(data: Buffer) {
    this.buffer = data;
    this.totalLength = data.length;
    this.startBit = 0;
    this.outOfRange = false;
  }

  read(update: boolean, len: number) {
    if (this.startBit >= this.buffer.length * 8) {
      this.outOfRange = true;
      return 0;
    }
    let byteOffset = Math.floor(this.startBit / 8);
    let bitOffSet = this.startBit % 8;
    let value = 0;
    for (let i = 0; i < len; i++) {
      let byte = this.buffer[byteOffset];
      let bit = (byte >> (7 - bitOffSet)) & 1;
      value = (value << 1) | bit;

      bitOffSet++;
      if (bitOffSet === 8) {
        bitOffSet = 0;
        byteOffset++;
      }
    }
    if (update) {
      this.startBit += len;
    }
    return value;
  }

  read_golomb() {
    let n;
    for (n = 0; this.read(true, 1) == 0 && !this.outOfRange; n++);
    return (1 << n) + this.read(true, n) - 1;
  }
}

export { AudioCodeNames, AudioSampleRates, VideoCodecNames, codecSpecificDetails };
