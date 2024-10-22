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
const H265Profiles: { [key: number]: string } = {
  "0": "Reserved",
  "1": "Main Profile",
  "2": "Main 10 Profile",
  "3": "Main Still Picture Profile",
  "4": "Reserved for future use",
  "5": "High Throughput Profile",
  "6": "Reserved for future use",
  "7": "Reserved for future use",
  "8": "Reserved for future use",
  "9": "Reserved for future use",
  "10": "Reserved for future use",
  "11": "Reserved for future use",
  "12": "Reserved for future use",
  "13": "Reserved for future use",
  "14": "Reserved for future use",
  "15": "Reserved for future use",
  "16": "Reserved for future use",
  "17": "Reserved for future use",
  "18": "Reserved for future use",
  "19": "Reserved for future use",
  "20": "Reserved for future use",
  "21": "Reserved for future use",
  "22": "Reserved for future use",
  "23": "Reserved for future use",
  "24": "Reserved for future use",
  "25": "Reserved for future use",
  "26": "Reserved for future use",
  "27": "Reserved for future use",
  "28": "Reserved for future use",
  "29": "Reserved for future use",
  "30": "Reserved for future use",
  "31": "High Profile",
};

function codecSpecificConfiguration(data: Buffer, codecId: number) {
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

  //skip 5 bytes since it indicates the begining of nal unit
  bitOp.read(true, 40);

  // //NAL header 8 bits
  // let fobiddenZeroBit = bitOp.read(true, 1);
  // let nalRefIdc = bitOp.read(true, 2);
  // let nalType = bitOp.read(true, 5);

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

function readHEVCdetails(data: Buffer) {
  let details: { [key: string]: number | string } = {};

  do {
    let hevc: { [key: string]: number | {} } = {};
    if (data.length < 23) {
      break;
    }

    let configurationVersion = data[0];
    if (configurationVersion != 1) {
      break;
    }
    let general_profile_space = (data[1] >> 6) & 0x03;
    let general_tier_flag = (data[1] >> 5) & 0x01;
    let general_profile_idc = data[1] & 0x1f;
    let general_profile_compatibility_flags = (data[2] << 24) | (data[3] << 16) | (data[4] << 8) | data[5];
    let general_constraint_indicator_flags = (data[6] << 24) | (data[7] << 16) | (data[8] << 8) | data[9];
    general_constraint_indicator_flags = (general_constraint_indicator_flags << 16) | (data[10] << 8) | data[11];
    let general_level_idc = data[12];
    let min_spatial_segmentation_idc = ((data[13] & 0x0f) << 8) | data[14];
    let parallelismType = data[15] & 0x03;
    let chromaFormat = data[16] & 0x03;
    let bitDepthLumaMinus8 = data[17] & 0x07;
    let bitDepthChromaMinus8 = data[18] & 0x07;
    let avgFrameRate = (data[19] << 8) | data[20];
    let constantFrameRate = (data[21] >> 6) & 0x03;
    let numTemporalLayers = (data[21] >> 3) & 0x07;
    let temporalIdNested = (data[21] >> 2) & 0x01;
    let lengthSizeMinusOne = data[21] & 0x03;
    let numOfArrays = data[22];
    let p = data.subarray(23);
    for (let i = 0; i < numOfArrays; i++) {
      if (p.length < 3) {
        break;
      }
      let nalutype = p[0];
      let n = (p[1] << 8) | p[2];
      // Logger.debug(nalutype, n);
      p = p.subarray(3);
      for (let j = 0; j < n; j++) {
        if (p.length < 2) {
          break;
        }
        let k = (p[0] << 8) | p[1];
        // Logger.debug('k', k);
        if (p.length < 2 + k) {
          break;
        }
        p = p.subarray(2);
        if (nalutype == 33) {
          let sps = Buffer.alloc(k);
          p.copy(sps, 0, 0, k);
          let psps = HEVCParseSPS(sps, hevc);
          details.profile = general_profile_idc;
          details.level = general_level_idc / 30.0;
          details.width =
            psps.pic_width_in_luma_samples - (psps.conf_win_left_offset + psps.conf_win_right_offset);
          details.height =
            psps.pic_height_in_luma_samples - (psps.conf_win_top_offset + psps.conf_win_bottom_offset);
        } else if (nalutype == 160) {
          let vps = Buffer.alloc(k);
          p.copy(vps, 0, 0, k);
          let vpsDecode = decodeVPS(vps);
          details.profile = H265Profiles[vpsDecode.profile_tier_level.general_profile_idc];
          details.level = vpsDecode.general_level_idc;
        }
        p = p.subarray(k);
      }
    }
  } while (0);

  return details;
}
function decodeVPS(buffer: Uint8Array) {
  let bitReader = new BitReader(buffer);
  let vps: { [key: string]: any } = {};

  vps["video_parameter_set_id"] = bitReader.readBits(4);
  vps["vps_reserved_three_2bits"] = bitReader.readBits(2);
  vps["vps_max_layers_minus1"] = bitReader.readBits(6);
  vps["vps_max_sub_layers_minus1"] = bitReader.readBits(3);
  vps["vps_temporal_id_nesting_flag"] = bitReader.readBit();
  vps["vps_reserved_0xffff_16bits"] = bitReader.readBits(16);

  vps["profile_tier_level"] = parseProfileTierLevel(bitReader, vps["vps_max_sub_layers_minus1"]);

  vps["vps_sub_layer_ordering_info_present_flag"] = bitReader.readBit();
  vps["vps_max_dec_pic_buffering_minus1"] = [];
  vps["vps_max_num_reorder_pics"] = [];
  vps["vps_max_latency_increase_plus1"] = [];

  let startLayer = vps["vps_sub_layer_ordering_info_present_flag"] ? 0 : vps["vps_max_sub_layers_minus1"];
  for (let i = startLayer; i <= vps["vps_max_sub_layers_minus1"]; i++) {
    vps["vps_max_dec_pic_buffering_minus1"][i] = bitReader.readUE();
    vps["vps_max_num_reorder_pics"][i] = bitReader.readUE();
    vps["vps_max_latency_increase_plus1"][i] = bitReader.readUE();
  }

  vps["vps_max_layer_id"] = bitReader.readBits(6);
  vps["vps_num_layer_sets_minus1"] = bitReader.readUE();
  vps["layer_id_included_flag"] = [];

  for (let i = 1; i <= vps["vps_num_layer_sets_minus1"]; i++) {
    vps["layer_id_included_flag"][i] = [];
    for (let j = 0; j <= vps["vps_max_layer_id"]; j++) {
      vps["layer_id_included_flag"][i][j] = bitReader.readBit();
    }
  }

  vps["vps_timing_info_present_flag"] = bitReader.readBit();
  if (vps["vps_timing_info_present_flag"]) {
    vps["vps_num_units_in_tick"] = bitReader.readBits(32);
    vps["vps_time_scale"] = bitReader.readBits(32);
    vps["vps_poc_proportional_to_timing_flag"] = bitReader.readBit();

    if (vps["vps_poc_proportional_to_timing_flag"]) {
      vps["vps_num_ticks_poc_diff_one_minus1"] = bitReader.readUE();
    }

    vps["vps_num_hrd_parameters"] = bitReader.readUE();
    vps["hrd_layer_set_idx"] = [];
    vps["cprms_present_flag"] = [];

    for (let i = 0; i < vps["vps_num_hrd_parameters"]; i++) {
      vps["hrd_layer_set_idx"][i] = bitReader.readUE();
      if (i > 0) {
        vps["cprms_present_flag"][i] = bitReader.readBit();
      }
      vps["hrd_parameters"][i] = parseHrdParameters(
        bitReader,
        vps["cprms_present_flag"][i],
        vps["vps_max_sub_layers_minus1"]
      );
    }
  }

  vps["vps_extension_flag"] = bitReader.readBit();
  if (vps["vps_extension_flag"]) {
    // Read vps_extension_data_flag bits...
  }

  return vps;
}
function parseProfileTierLevel(bitReader: BitReader, maxSubLayersMinus1: number) {
  let ptl: { [key: string]: any } = {};
  ptl["general_profile_space"] = bitReader.readBits(2);
  ptl["general_tier_flag"] = bitReader.readBit();
  ptl["general_profile_idc"] = bitReader.readBits(5);

  ptl["general_profile_compatibility_flags"] = [];
  for (let i = 0; i < 32; i++) {
    ptl["general_profile_compatibility_flags"][i] = bitReader.readBit();
  }

  ptl["general_progressive_source_flag"] = bitReader.readBit();
  ptl["general_interlaced_source_flag"] = bitReader.readBit();
  ptl["general_non_packed_constraint_flag"] = bitReader.readBit();
  ptl["general_frame_only_constraint_flag"] = bitReader.readBit();

  // Skip remaining bits
  bitReader.readBits(44); // assuming a 64-bit field, skipping already read 20 bits

  ptl["general_level_idc"] = bitReader.readBits(8);

  ptl["sub_layer_profile_present_flag"] = [];
  ptl["sub_layer_level_present_flag"] = [];

  for (let i = 0; i < maxSubLayersMinus1; i++) {
    ptl["sub_layer_profile_present_flag"][i] = bitReader.readBit();
    ptl["sub_layer_level_present_flag"][i] = bitReader.readBit();
  }

  if (maxSubLayersMinus1 > 0) {
    for (let i = maxSubLayersMinus1; i < 8; i++) {
      bitReader.readBits(2); // reserved bits
    }
  }

  ptl["sub_layer_profile_space"] = [];
  ptl["sub_layer_tier_flag"] = [];
  ptl["sub_layer_profile_idc"] = [];
  ptl["sub_layer_profile_compatibility_flags"] = [];
  ptl["sub_layer_level_idc"] = [];

  for (let i = 0; i < maxSubLayersMinus1; i++) {
    if (ptl["sub_layer_profile_present_flag"][i]) {
      ptl["sub_layer_profile_space"][i] = bitReader.readBits(2);
      ptl["sub_layer_tier_flag"][i] = bitReader.readBit();
      ptl["sub_layer_profile_idc"][i] = bitReader.readBits(5);

      ptl["sub_layer_profile_compatibility_flags"][i] = [];
      for (let j = 0; j < 32; j++) {
        ptl["sub_layer_profile_compatibility_flags"][i][j] = bitReader.readBit();
      }

      ptl["sub_layer_progressive_source_flag"] = bitReader.readBit();
      ptl["sub_layer_interlaced_source_flag"] = bitReader.readBit();
      ptl["sub_layer_non_packed_constraint_flag"] = bitReader.readBit();
      ptl["sub_layer_frame_only_constraint_flag"] = bitReader.readBit();

      // Skip remaining bits
      bitReader.readBits(44); // assuming a 64-bit field, skipping already read 20 bits
    }

    if (ptl["sub_layer_level_present_flag"][i]) {
      ptl["sub_layer_level_idc"][i] = bitReader.readBits(8);
    }
  }

  return ptl;
}

function parseHrdParameters(bitReader: BitReader, commonInfPresentFlag: boolean, maxNumSubLayersMinus1: number) {
  let hrd: { [key: string]: any } = {};

  if (commonInfPresentFlag) {
    hrd["nal_hrd_parameters_present_flag"] = bitReader.readBit();
    hrd["vcl_hrd_parameters_present_flag"] = bitReader.readBit();

    if (hrd["nal_hrd_parameters_present_flag"] || hrd["vcl_hrd_parameters_present_flag"]) {
      hrd["sub_pic_hrd_params_present_flag"] = bitReader.readBit();

      if (hrd["sub_pic_hrd_params_present_flag"]) {
        hrd["tick_divisor_minus2"] = bitReader.readBits(8);
        hrd["du_cpb_removal_delay_increment_length_minus1"] = bitReader.readBits(5);
        hrd["sub_pic_cpb_params_in_pic_timing_sei_flag"] = bitReader.readBit();
        hrd["dpb_output_delay_du_length_minus1"] = bitReader.readBits(5);
      }

      hrd["bit_rate_scale"] = bitReader.readBits(4);
      hrd["cpb_size_scale"] = bitReader.readBits(4);

      if (hrd["sub_pic_hrd_params_present_flag"]) {
        hrd["cpb_size_du_scale"] = bitReader.readBits(4);
      }

      hrd["initial_cpb_removal_delay_length_minus1"] = bitReader.readBits(5);
      hrd["au_cpb_removal_delay_length_minus1"] = bitReader.readBits(5);
      hrd["dpb_output_delay_length_minus1"] = bitReader.readBits(5);
    }
  }

  hrd["cpb_cnt_minus1"] = [];
  hrd["bit_rate_value_minus1"] = [];
  hrd["cpb_size_value_minus1"] = [];
  hrd["cpb_size_du_value_minus1"] = [];
  hrd["bit_rate_du_value_minus1"] = [];
  hrd["cbr_flag"] = [];

  for (let i = 0; i <= maxNumSubLayersMinus1; i++) {
    if (commonInfPresentFlag) {
      hrd["cpb_cnt_minus1"][i] = bitReader.readUE();

      hrd["bit_rate_value_minus1"][i] = [];
      hrd["cpb_size_value_minus1"][i] = [];
      hrd["cpb_size_du_value_minus1"][i] = [];
      hrd["bit_rate_du_value_minus1"][i] = [];
      hrd["cbr_flag"][i] = [];

      for (let j = 0; j <= hrd["cpb_cnt_minus1"][i]; j++) {
        hrd["bit_rate_value_minus1"][i][j] = bitReader.readUE();
        hrd["cpb_size_value_minus1"][i][j] = bitReader.readUE();

        if (hrd["sub_pic_hrd_params_present_flag"]) {
          hrd["cpb_size_du_value_minus1"][i][j] = bitReader.readUE();
          hrd["bit_rate_du_value_minus1"][i][j] = bitReader.readUE();
        }

        hrd["cbr_flag"][i][j] = bitReader.readBit();
      }
    }
  }

  return hrd;
}

class BitReader {
  private buffer: Uint8Array;
  private byteIndex: number;
  private bitIndex: number;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
    this.byteIndex = 0;
    this.bitIndex = 0;
  }

  readBits(numBits: number): number {
    let result = 0;
    for (let i = 0; i < numBits; i++) {
      if (this.bitIndex === 8) {
        this.byteIndex++;
        this.bitIndex = 0;
      }
      result <<= 1;
      result |= (this.buffer[this.byteIndex] >> (7 - this.bitIndex)) & 1;
      this.bitIndex++;
    }
    return result;
  }

  readBit(): number {
    return this.readBits(1);
  }

  readUE(): number {
    let zeroes = 0;
    while (this.readBit() === 0) {
      zeroes++;
    }
    let result = (1 << zeroes) - 1;
    for (let i = 0; i < zeroes; i++) {
      result |= this.readBit() << (zeroes - 1 - i);
    }
    return result;
  }
}

function HEVCParseSPS(SPS: Buffer, hevc: any) {
  let psps: { [key: string]: number } = {};
  let NumBytesInNALunit = SPS.length;
  let NumBytesInRBSP = 0;
  let rbsp_array = [];
  let bitop = new BitOperations(SPS);

  bitop.read(true, 1); //forbidden_zero_bit
  bitop.read(true, 6); //nal_unit_type
  bitop.read(true, 6); //nuh_reserved_zero_6bits
  bitop.read(true, 3); //nuh_temporal_id_plus1

  for (let i = 2; i < NumBytesInNALunit; i++) {
    if (i + 2 < NumBytesInNALunit && bitop.read(false, 24) == 0x000003) {
      rbsp_array.push(bitop.read(true, 8));
      rbsp_array.push(bitop.read(true, 8));
      i += 2;
      let emulation_prevention_three_byte = bitop.read(true, 8); /* equal to 0x03 */
    } else {
      rbsp_array.push(bitop.read(true, 8));
    }
  }
  let rbsp = Buffer.from(rbsp_array);
  let rbspBitop = new BitOperations(rbsp);
  psps.sps_video_parameter_set_id = rbspBitop.read(true, 4);
  psps.sps_max_sub_layers_minus1 = rbspBitop.read(true, 3);
  psps.sps_temporal_id_nesting_flag = rbspBitop.read(true, 1);
  // psps.profile_tier_level = HEVCParsePtl(rbspBitop, hevc, psps.sps_max_sub_layers_minus1);
  psps.sps_seq_parameter_set_id = rbspBitop.read_golomb();
  psps.chroma_format_idc = rbspBitop.read_golomb();
  if (psps.chroma_format_idc == 3) {
    psps.separate_colour_plane_flag = rbspBitop.read(true, 1);
  } else {
    psps.separate_colour_plane_flag = 0;
  }
  psps.pic_width_in_luma_samples = rbspBitop.read_golomb();
  psps.pic_height_in_luma_samples = rbspBitop.read_golomb();
  psps.conformance_window_flag = rbspBitop.read(true, 1);
  psps.conf_win_left_offset = 0;
  psps.conf_win_right_offset = 0;
  psps.conf_win_top_offset = 0;
  psps.conf_win_bottom_offset = 0;
  if (psps.conformance_window_flag) {
    let vert_mult = 1 + (psps.chroma_format_idc << 2);
    let horiz_mult = 1 + (psps.chroma_format_idc << 3);
    psps.conf_win_left_offset = rbspBitop.read_golomb() * horiz_mult;
    psps.conf_win_right_offset = rbspBitop.read_golomb() * horiz_mult;
    psps.conf_win_top_offset = rbspBitop.read_golomb() * vert_mult;
    psps.conf_win_bottom_offset = rbspBitop.read_golomb() * vert_mult;
  }
  // Logger.debug(psps);
  return psps;
}
function HEVCParsePtl(bitop: BitOperations, hevc: number, max_sub_layers_minus1: number) {
  let general_ptl: { [key: string]: number | any[] } = {};

  general_ptl.profile_space = bitop.read(true, 2);
  general_ptl.tier_flag = bitop.read(true, 1);
  general_ptl.profile_idc = bitop.read(true, 5);
  general_ptl.profile_compatibility_flags = bitop.read(true, 32);
  general_ptl.general_progressive_source_flag = bitop.read(true, 1);
  general_ptl.general_interlaced_source_flag = bitop.read(true, 1);
  general_ptl.general_non_packed_constraint_flag = bitop.read(true, 1);
  general_ptl.general_frame_only_constraint_flag = bitop.read(true, 1);
  bitop.read(true, 32);
  bitop.read(true, 12);
  general_ptl.level_idc = bitop.read(true, 8);

  general_ptl.sub_layer_profile_present_flag = [];
  general_ptl.sub_layer_level_present_flag = [];

  for (let i = 0; i < max_sub_layers_minus1; i++) {
    general_ptl.sub_layer_profile_present_flag[i] = bitop.read(true, 1);
    general_ptl.sub_layer_level_present_flag[i] = bitop.read(true, 1);
  }

  if (max_sub_layers_minus1 > 0) {
    for (let i = max_sub_layers_minus1; i < 8; i++) {
      bitop.read(true, 2);
    }
  }

  general_ptl.sub_layer_profile_space = new Array(max_sub_layers_minus1);
  general_ptl.sub_layer_tier_flag = new Array(max_sub_layers_minus1);
  general_ptl.sub_layer_profile_idc = new Array(max_sub_layers_minus1);
  general_ptl.sub_layer_profile_compatibility_flag = new Array(max_sub_layers_minus1);
  general_ptl.sub_layer_progressive_source_flag = new Array(max_sub_layers_minus1);
  general_ptl.sub_layer_interlaced_source_flag = new Array(max_sub_layers_minus1);
  general_ptl.sub_layer_non_packed_constraint_flag = new Array(max_sub_layers_minus1);
  general_ptl.sub_layer_frame_only_constraint_flag = new Array(max_sub_layers_minus1);
  general_ptl.sub_layer_level_idc = new Array(max_sub_layers_minus1);

  for (let i = 0; i < max_sub_layers_minus1; i++) {
    if (general_ptl.sub_layer_profile_present_flag[i]) {
      general_ptl.sub_layer_profile_space[i] = bitop.read(true, 2);
      general_ptl.sub_layer_tier_flag[i] = bitop.read(true, 1);
      general_ptl.sub_layer_profile_idc[i] = bitop.read(true, 5);
      general_ptl.sub_layer_profile_compatibility_flag[i] = bitop.read(true, 32);
      general_ptl.sub_layer_progressive_source_flag[i] = bitop.read(true, 1);
      general_ptl.sub_layer_interlaced_source_flag[i] = bitop.read(true, 1);
      general_ptl.sub_layer_non_packed_constraint_flag[i] = bitop.read(true, 1);
      general_ptl.sub_layer_frame_only_constraint_flag[i] = bitop.read(true, 1);
      bitop.read(true, 32);
      bitop.read(true, 12);
    }
    if (general_ptl.sub_layer_level_present_flag[i]) {
      general_ptl.sub_layer_level_idc[i] = bitop.read(true, 8);
    } else {
      general_ptl.sub_layer_level_idc[i] = 1;
    }
  }
  return general_ptl;
}
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

export { AudioCodeNames, AudioSampleRates, VideoCodecNames, codecSpecificConfiguration };
