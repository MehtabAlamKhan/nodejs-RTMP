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
const AV1Profiles = ["Main", "High", "Pro"];

function codecSpecificConfiguration(data: Buffer, codecId: number) {
  if (codecId === 7) return H264DecoderConfigurationRecord(data);
  if (codecId === 12) return HEVCDecoderConfigurationRecord(data);
  if (codecId === 13) return AV1DecoderConfigurationRecord(data);
  if (codecId === 14) return VP9CodecConfigurationRecord(data);
}

function H264DecoderConfigurationRecord(data: Buffer) {
  const reader = new BitReader(data);
  const details = {
    level: 0,
    height: 0,
    refFrames: 0,
    width: 0,
    profile: "",
  };
  // Skip 5 bytes (40 bits)
  reader.readBits(40);

  // Read NAL header (8 bits)
  // const forbiddenZeroBit = reader.readBits(1);
  // const nalRefIdc = reader.readBits(2);
  // const nalType = reader.readBits(5);

  const profileIdc = reader.readBits(8);
  const constFlags = reader.readBits(8);
  const levelIdc = reader.readBits(8);
  const nalUnit = reader.readBits(8);
  const numberOfSpsUnits = reader.readBits(8) & 31;

  // At least one unit should be present to decode details
  if (numberOfSpsUnits === 0) {
    return details;
  }

  // NAL size (16 bits)
  reader.readBits(16);

  // If not 0x67 (103) then no SEI
  if (reader.readBits(8) !== 0x67) {
    return details;
  }

  // Read profileIdc, flags, levelIdc
  const profileIdcVal = reader.readBits(8);
  details.profile = H264Profiles[profileIdcVal];
  reader.readBits(8);
  details.level = reader.readBits(8) / 10.0;

  // Read SPS id
  reader.readUE();

  if (
    profileIdcVal === 100 ||
    profileIdcVal === 110 ||
    profileIdcVal === 122 ||
    profileIdcVal === 244 ||
    profileIdcVal === 44 ||
    profileIdcVal === 83 ||
    profileIdcVal === 86 ||
    profileIdcVal === 118
  ) {
    const chromaFmtIdc = reader.readUE();
    if (chromaFmtIdc === 3) {
      reader.readBits(1);
    }
    // Bit depth luma - 8
    reader.readUE();
    // Bit depth chroma - 8
    reader.readUE();
    // Qpprime y zero transform bypass
    reader.readBits(1);
    // Seq scaling matrix present
    if (reader.readBits(1)) {
      for (let n = 0; n < (chromaFmtIdc !== 3 ? 8 : 12); n++) {
        // Seq scaling list present
        if (reader.readBits(1)) {
          // Skip scaling list
        }
      }
    }
  }

  // Log2 max frame num
  reader.readUE();

  // Pic order cnt type
  switch (reader.readUE()) {
    case 0:
      // Max pic order cnt
      reader.readUE();
      break;
    case 1:
      // Delta pic order always zero
      reader.readBits(1);
      // Offset for non-ref pic
      reader.readUE();
      // Offset for top to bottom field
      reader.readUE();
      // Num ref frames in pic order
      const noOfRefFrames = reader.readUE();
      for (let n = 0; n < noOfRefFrames; n++) {
        // Offset for ref frame
        reader.readUE();
      }
      break;
  }

  // Num ref frames
  details.refFrames = reader.readUE();

  // Gaps in frame num allowed
  reader.readBits(1);

  const width = reader.readGolomb();
  const height = reader.readGolomb();
  const frameMbsOnly = reader.readBits(1);

  if (!frameMbsOnly) {
    // Mbs adaptive frame field
    reader.readBits(1);
  }

  // Direct 8x8 inference flag
  reader.readBits(1);

  let cropLeft, cropRight, cropTop, cropBottom;
  if (reader.readBits(1)) {
    cropLeft = reader.readUE();
    cropRight = reader.readUE();
    cropTop = reader.readUE();
    cropBottom = reader.readUE();
  } else {
    cropLeft = 0;
    cropRight = 0;
    cropTop = 0;
    cropBottom = 0;
  }

  details.level = details.level / 10.0;
  details.width = (width + 1) * 16 - (cropLeft + cropRight) * 2;
  details.height = (2 - frameMbsOnly) * (height + 1) * 16 - (cropTop + cropBottom) * 2;

  return details;
}

function HEVCDecoderConfigurationRecord(data: Buffer) {
  let details: { [key: string]: number | string } = {};
  const reader = new BitReader(data);
  if (data.length < 23) {
    return details;
  }
  const configurationVersion = reader.readBits(8);
  if (configurationVersion != 1) {
    return details;
  }
  const general_profile_space = (reader.readBits(2) >> 0) & 0x03;
  const general_tier_flag = (reader.readBits(1) >> 0) & 0x01;
  const general_profile_idc = (reader.readBits(5) >> 0) & 0x1f;
  const general_profile_compatibility_flags = reader.readBits(32);
  const general_constraint_indicator_flags = (reader.readBits(32) << 16) | reader.readBits(16);
  const general_level_idc = reader.readBits(8);
  const min_spatial_segmentation_idc = reader.readBits(12);
  const parallelismType = reader.readBits(2);
  const chromaFormat = reader.readBits(2);
  const bitDepthLumaMinus8 = reader.readBits(3);
  const bitDepthChromaMinus8 = reader.readBits(3);
  const avgFrameRate = reader.readBits(16);
  const constantFrameRate = reader.readBits(2);
  const numTemporalLayers = reader.readBits(3);
  const temporalIdNested = reader.readBits(1);
  const lengthSizeMinusOne = reader.readBits(2);
  const numOfArrays = reader.readBits(8);

  for (let i = 0; i < numOfArrays; i++) {
    const array_completeness = reader.readBits(1);
    const reserved = reader.readBits(1);
    const nal_unit_type = reader.readBits(6);
    const numNalus = reader.readBits(16);

    for (let j = 0; j < numNalus; j++) {
      const nalUnitLength = reader.readBits(16);
      const nalUnit = new Uint8Array(nalUnitLength);

      for (let k = 0; k < nalUnitLength; k++) {
        nalUnit[k] = reader.readBits(8);
      }

      switch (nal_unit_type) {
        case 32: // VPS
          decodeVPS(nalUnit);
          break;
        case 33: // SPS
          // decodeSPS(nalUnit);
          break;
        case 34: // PPS
          // decodePPS(nalUnit);
          break;
        default:
          // Handle other NAL unit types
          break;
      }
    }
  }
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

function AV1DecoderConfigurationRecord(data: Buffer) {
  const reader = new BitReader(data);
  const marker = reader.readBits(8); // Should be 0x81
  const version = reader.readBits(2);
  const seq_profile = reader.readBits(3);
  const seq_level_idx_0 = reader.readBits(5);
  const seq_tier_0 = reader.readBit();
  const high_bitdepth = reader.readBit();
  const twelve_bit = high_bitdepth ? reader.readBit() : 0;
  const monochrome = reader.readBit();
  const chroma_subsampling_x = reader.readBit();
  const chroma_subsampling_y = reader.readBit();
  const chroma_sample_position =
    !monochrome && (chroma_subsampling_x || chroma_subsampling_y) ? reader.readBits(2) : 0;
  const initial_presentation_delay_present = reader.readBit();
  const initial_presentation_delay_minus_one = initial_presentation_delay_present ? reader.readBits(4) : 0;

  // Additional AV1 configuration fields
  const reserved = reader.readBits(6); // Reserved bits for future use
  const frame_width_minus_1 = reader.readUInt(16);
  const frame_height_minus_1 = reader.readUInt(16);
  const bit_rate_scale = reader.readUInt(4);
  const bit_rate_value_minus1 = reader.readUE();
  const reserved2 = reader.readBits(7); // More reserved bits

  const width = frame_width_minus_1 + 1;
  const height = frame_height_minus_1 + 1;
  const bitRate = (bit_rate_value_minus1 + 1) << bit_rate_scale;

  // Continue decoding
  const seq_level_idx_1 = reader.readBits(5);
  const seq_tier_1 = reader.readBit();
  const frame_rate_denominator = reader.readUInt(16);
  const frame_rate_numerator = reader.readUInt(16);
  const display_width_minus_1 = reader.readUInt(16);
  const display_height_minus_1 = reader.readUInt(16);
  const display_width = display_width_minus_1 + 1;
  const display_height = display_height_minus_1 + 1;

  const av1Config = {
    marker: marker,
    version: version,
    profile: AV1Profiles[seq_profile],
    seq_level_idx_0: seq_level_idx_0,
    seq_tier_0: seq_tier_0,
    high_bitdepth: high_bitdepth,
    twelve_bit: twelve_bit,
    monochrome: monochrome,
    chroma_subsampling_x: chroma_subsampling_x,
    chroma_subsampling_y: chroma_subsampling_y,
    chroma_sample_position: chroma_sample_position,
    initial_presentation_delay_present: initial_presentation_delay_present,
    initial_presentation_delay_minus_one: initial_presentation_delay_minus_one,
    frame_width: width,
    frame_height: height,
    bit_rate: bitRate,
    seq_level_idx_1: seq_level_idx_1,
    seq_tier_1: seq_tier_1,
    frame_rate_denominator: frame_rate_denominator,
    frame_rate_numerator: frame_rate_numerator,
    height: display_width,
    width: display_height,
    level: 0,
  };

  //second
  // let reader = new BitReader(data);
  // const marker = reader.readBits(1); // 1 bit
  // const version = reader.readBits(7); // 7 bits
  // const seq_profile = reader.readBits(3); // 3 bits
  // const seq_level_idx_0 = reader.readBits(5); // 5 bits
  // const seq_tier_0 = reader.readBit(); // 1 bit
  // const high_bitdepth = reader.readBit(); // 1 bit
  // const twelve_bit = high_bitdepth ? reader.readBit() : 0; // 1 bit, only if high_bitdepth
  // const monochrome = reader.readBit(); // 1 bit
  // const chroma_subsampling_x = reader.readBit(); // 1 bit
  // const chroma_subsampling_y = reader.readBit(); // 1 bit
  // const chroma_sample_position =
  //   !monochrome && (chroma_subsampling_x || chroma_subsampling_y) ? reader.readBits(2) : 0; // 2 bits
  // const reserved = reader.readBits(3); // 3 bits reserved
  // const initial_presentation_delay_present = reader.readBit(); // 1 bit
  // const initial_presentation_delay_minus_one = initial_presentation_delay_present ? reader.readBits(4) : 0; // 4 bits if present

  // // Read OBUs (variable length)
  // const obus = [];
  // while (reader.byteIndex < data.length) {
  //   const obuLength = reader.readBits(16); // 16 bits
  //   const obuData = new Uint8Array(obuLength);

  //   for (let i = 0; i < obuLength; i++) {
  //     obuData[i] = reader.readBits(8);
  //   }

  //   const obuType = obuData[0] & 0xf; // Last 4 bits of the first byte represent the OBU type

  //   obus.push({ obuType, obuLength, obuData });

  //   // Decode OBU
  //   // decodeOBU(obuType, obuData);
  // }

  // const av1Config = {
  //   marker,
  //   version,
  //   seq_profile,
  //   seq_level_idx_0,
  //   seq_tier_0,
  //   high_bitdepth,
  //   twelve_bit,
  //   monochrome,
  //   chroma_subsampling_x,
  //   chroma_subsampling_y,
  //   chroma_sample_position,
  //   initial_presentation_delay_present,
  //   initial_presentation_delay_minus_one,
  //   obus,
  // };
  return av1Config;
}

function VP9CodecConfigurationRecord(data: Buffer) {
  let reader = new BitReader(data);
  const profile = reader.readBits(8);
  const level = reader.readBits(8);
  const widthMinusOne = reader.readBits(16);
  const heightMinusOne = reader.readBits(16);
  const bitDepth = reader.readBits(4);
  const chromaSubsampling = reader.readBits(3);
  const videoFullRangeFlag = reader.readBit();
  const colourPrimaries = reader.readBits(8);
  const transferCharacteristics = reader.readBits(8);
  const matrixCoefficients = reader.readBits(8);
  const codecInitializationDataSize = reader.readBits(16);

  // Read codec initialization data
  const codecInitializationData: Uint8Array = new Uint8Array(codecInitializationDataSize);
  for (let i = 0; i < codecInitializationDataSize; i++) {
    codecInitializationData[i] = reader.readBits(8);
  }

  // Calculate actual width and height
  const width = widthMinusOne + 1;
  const height = heightMinusOne + 1;

  reader = new BitReader(data);
  const marker = reader.readBits(8);
  const version = reader.readBits(2);
  //profile
  reader.readBits(3);
  const reserved = reader.readBits(3);
  // widthMinusOne
  reader.readBits(16);
  // heightMinusOne
  reader.readBits(16);
  const frameRate = reader.readBits(8);
  const aspectRatio = reader.readBits(8);
  //const bitDepth
  reader.readBits(4);
  // const chromaSubsampling
  reader.readBits(2);
  const colorSpace = reader.readBits(1);
  const fullRangeFlag = reader.readBits(1);

  const colorRange = fullRangeFlag ? "Full range" : "Limited range";

  // Process the VP9 configuration fields as needed
  const vp9Config = {
    profile,
    level,
    width,
    height,
    bitDepth,
    chromaSubsampling,
    videoFullRangeFlag,
    colourPrimaries,
    transferCharacteristics,
    matrixCoefficients,
    codecInitializationDataSize,
    codecInitializationData,
    marker,
    version,
    reserved,
    frameRate,
    aspectRatio,
    colorSpace,
    colorRange,
  };
  return vp9Config;
}

class BitReader {
  private buffer: Uint8Array;
  public byteIndex: number;
  public bitIndex: number;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
    this.byteIndex = 0;
    this.bitIndex = 0;
  }

  readBits(numBits: number): number {
    let result = 0;
    for (let i = 0; i < numBits; i++) {
      result <<= 1;
      result |= (this.buffer[this.byteIndex] >> (7 - this.bitIndex)) & 1;
      this.bitIndex++;
      if (this.bitIndex === 8) {
        this.byteIndex++;
        this.bitIndex = 0;
      }
    }
    return result;
  }

  readBit(): number {
    return this.readBits(1);
  }
  readUInt(numBits: number): number {
    return this.readBits(numBits);
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
  readSE(): number {
    const value = this.readUE();
    return value & 1 ? (value + 1) >> 1 : -(value >> 1);
  }
  readGolomb(): number {
    let n = 0;
    while (this.readBit() === 0) {
      n++;
    }
    return (1 << n) + this.readBits(n) - 1;
  }
}

export { AudioCodeNames, AudioSampleRates, VideoCodecNames, codecSpecificConfiguration };
