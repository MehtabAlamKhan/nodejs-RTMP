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

//todo
function HEVCDecoderConfigurationRecord(data: Buffer) {
  const parsedData: any = {};

  // Read configurationVersion (1 byte)
  parsedData.configurationVersion = data[0];

  // Read general_profile_space (2 bits), general_tier_flag (1 bit), and general_profile_idc (5 bits)
  const profileSpaceTierProfile = data[1];
  parsedData.generalProfileSpace = (profileSpaceTierProfile >> 6) & 0x03;
  parsedData.generalTierFlag = (profileSpaceTierProfile >> 5) & 0x01;
  parsedData.generalProfileIDC = profileSpaceTierProfile & 0x1f;

  // Read general_profile_compatibility_flags (32 bits)
  parsedData.generalProfileCompatibilityFlags = (data[2] << 24) | (data[3] << 16) | (data[4] << 8) | data[5];

  // Read general_constraint_indicator_flags (48 bits) as a number (split into high and low parts)
  const highConstraintFlags = (data[6] << 16) | (data[7] << 8) | data[8];
  const lowConstraintFlags = (data[9] << 16) | (data[10] << 8) | data[11];
  parsedData.generalConstraintIndicatorFlags = { high: highConstraintFlags, low: lowConstraintFlags };

  // Read general_level_idc (1 byte)
  parsedData.generalLevelIDC = data[12];

  // Read LengthSizeMinusOne (2 bits) and reserved bits
  parsedData.lengthSizeMinusOne = data[13] & 0x03;

  // Read numOfArrays (1 byte)
  parsedData.numOfArrays = data[14];

  // Read arrays (NAL unit arrays)
  parsedData.arrays = [];
  let index = 15; // Start reading from the 15th byte

  for (let i = 0; i < parsedData.numOfArrays; i++) {
    const array: any = {};
    array.arrayCompleteness = (data[index] >> 7) & 0x01; // 1 bit
    array.nalUnitType = data[index] & 0x3f; // 6 bits
    const numNalus = (data[index + 1] << 8) | data[index + 2]; // 16 bits
    index += 3;

    array.nalUnits = []; // Array to hold NAL units

    for (let j = 0; j < numNalus; j++) {
      const nalUnit: any = {};
      nalUnit.length = (data[index] << 8) | data[index + 1]; // Read length (16 bits)
      index += 2;

      nalUnit.data = []; // Array to hold NAL unit data

      // Read NAL unit data
      for (let k = 0; k < nalUnit.length; k++) {
        nalUnit.data.push(data[index]); // Read each byte of NAL unit data
        index++;
      }

      array.nalUnits.push(nalUnit); // Add the NAL unit to the array
    }

    parsedData.arrays.push(array); // Add the array to the parsed data
  }

  return parsedData;
}

function decodeVPS(nalUnit: Uint8Array) {
  const vps: any = {};
  let index = 0;

  // nal_unit_type (type 32 is VPS)
  const nalUnitType = (nalUnit[0] >> 1) & 0x3f;
  vps.nalUnitType = nalUnitType;

  // Skip the NAL header (first byte)
  index = 2;

  // Read vps_video_parameter_set_id (4 bits)
  vps.vpsVideoParameterSetID = nalUnit[index] & 0x0f;

  // Read vps_base_layer_internal_flag (1 bit) and vps_base_layer_available_flag (1 bit)
  vps.vpsBaseLayerInternalFlag = (nalUnit[index] >> 4) & 0x01;
  vps.vpsBaseLayerAvailableFlag = (nalUnit[index] >> 5) & 0x01;
  index++;

  // Read vps_max_layers_minus1 (6 bits)
  vps.vpsMaxLayersMinus1 = nalUnit[index] & 0x3f;

  // Read vps_max_sub_layers_minus1 (3 bits)
  vps.vpsMaxSubLayersMinus1 = (nalUnit[index] >> 6) & 0x07;
  index++;

  // Read vps_temporal_id_nesting_flag (1 bit)
  vps.vpsTemporalIdNestingFlag = (nalUnit[index] >> 7) & 0x01;

  // Skip vps_reserved_0xffff_16bits (16 bits)
  index += 2;

  // Read profile_tier_level for the base layer
  vps.profileTierLevel = decodeProfileTierLevel(nalUnit, index, vps.vpsMaxSubLayersMinus1);
  index += vps.profileTierLevel.size; // Update index by size of profile_tier_level

  // Read vps_max_layer_id (6 bits)
  vps.vpsMaxLayerID = nalUnit[index] & 0x3f;

  // Read vps_num_layer_sets_minus1 (16 bits)
  vps.vpsNumLayerSetsMinus1 = (nalUnit[index + 1] << 8) | nalUnit[index];
  index += 2;

  // Read layer_id_included_flag (for each layer set)
  vps.layerIdIncludedFlags = [];
  for (let i = 0; i <= vps.vpsNumLayerSetsMinus1; i++) {
    vps.layerIdIncludedFlags[i] = [];
    for (let j = 0; j <= vps.vpsMaxLayerID; j++) {
      const flag = (nalUnit[index] >> (7 - j)) & 0x01;
      vps.layerIdIncludedFlags[i].push(flag);
    }
    index++;
  }

  // Optional timing information, if vps_timing_info_present_flag is set
  vps.vpsTimingInfoPresentFlag = (nalUnit[index] >> 7) & 0x01;
  index++;

  if (vps.vpsTimingInfoPresentFlag) {
    // vps_num_units_in_tick (32 bits) and vps_time_scale (32 bits)
    vps.vpsNumUnitsInTick =
      (nalUnit[index] << 24) | (nalUnit[index + 1] << 16) | (nalUnit[index + 2] << 8) | nalUnit[index + 3];
    index += 4;
    vps.vpsTimeScale =
      (nalUnit[index] << 24) | (nalUnit[index + 1] << 16) | (nalUnit[index + 2] << 8) | nalUnit[index + 3];
    index += 4;

    // vps_poc_proportional_to_timing_flag (1 bit)
    vps.vpsPocProportionalToTimingFlag = (nalUnit[index] >> 7) & 0x01;
    index++;

    if (vps.vpsPocProportionalToTimingFlag) {
      // vps_num_ticks_poc_diff_one_minus1 (32 bits)
      vps.vpsNumTicksPocDiffOneMinus1 =
        (nalUnit[index] << 24) | (nalUnit[index + 1] << 16) | (nalUnit[index + 2] << 8) | nalUnit[index + 3];
      index += 4;
    }
  }

  // vps_num_hrd_parameters (16 bits)
  vps.vpsNumHrdParameters = (nalUnit[index] << 8) | nalUnit[index + 1];
  index += 2;

  vps.hrdParameters = [];
  for (let i = 0; i < vps.vpsNumHrdParameters; i++) {
    const hrdLayerSetIdx = (nalUnit[index] << 8) | nalUnit[index + 1];
    const cprmsPresentFlag = nalUnit[index + 2] & 0x01;
    index += 3;

    const hrdParams = decodeHrdParameters(
      nalUnit,
      index,
      cprmsPresentFlag ? true : false,
      vps.vpsMaxSubLayersMinus1
    );
    vps.hrdParameters.push({ hrdLayerSetIdx, cprmsPresentFlag, hrdParams });
    index += hrdParams.size;
  }

  return vps;
}

function decodeProfileTierLevel(nalUnit: Uint8Array, index: number, maxSubLayersMinus1: number) {
  const profileTierLevel: any = {};

  // Read general_profile_space (2 bits), general_tier_flag (1 bit), and general_profile_idc (5 bits)
  profileTierLevel.generalProfileSpace = (nalUnit[index] >> 6) & 0x03;
  profileTierLevel.generalTierFlag = (nalUnit[index] >> 5) & 0x01;
  profileTierLevel.generalProfileIDC = nalUnit[index] & 0x1f;
  index++;

  // Read general_profile_compatibility_flags (32 bits)
  profileTierLevel.generalProfileCompatibilityFlags =
    (nalUnit[index] << 24) | (nalUnit[index + 1] << 16) | (nalUnit[index + 2] << 8) | nalUnit[index + 3];
  index += 4;

  // Read general_constraint_indicator_flags (48 bits)
  const highConstraintFlags = (nalUnit[index] << 16) | (nalUnit[index + 1] << 8) | nalUnit[index + 2];
  const lowConstraintFlags = (nalUnit[index + 3] << 16) | (nalUnit[index + 4] << 8) | nalUnit[index + 5];
  profileTierLevel.generalConstraintIndicatorFlags = { high: highConstraintFlags, low: lowConstraintFlags };
  index += 6;

  // Read general_level_idc (1 byte)
  profileTierLevel.generalLevelIDC = nalUnit[index];
  index++;

  // Parse sub-layer profile_present_flag and sub_layer_level_present_flag
  profileTierLevel.subLayerProfilePresentFlag = [];
  profileTierLevel.subLayerLevelPresentFlag = [];
  for (let i = 0; i < maxSubLayersMinus1; i++) {
    profileTierLevel.subLayerProfilePresentFlag[i] = (nalUnit[index] >> 7) & 0x01;
    profileTierLevel.subLayerLevelPresentFlag[i] = (nalUnit[index] >> 6) & 0x01;
    index++;
  }

  // If subLayerProfilePresentFlag or subLayerLevelPresentFlag is set, parse sub-layer information
  profileTierLevel.subLayers = [];
  for (let i = 0; i < maxSubLayersMinus1; i++) {
    const subLayer: any = {};
    if (profileTierLevel.subLayerProfilePresentFlag[i]) {
      subLayer.subLayerProfileSpace = (nalUnit[index] >> 6) & 0x03;
      subLayer.subLayerTierFlag = (nalUnit[index] >> 5) & 0x01;
      subLayer.subLayerProfileIDC = nalUnit[index] & 0x1f;
      index++;

      // Read sub_layer_profile_compatibility_flags (32 bits)
      subLayer.subLayerProfileCompatibilityFlags =
        (nalUnit[index] << 24) | (nalUnit[index + 1] << 16) | (nalUnit[index + 2] << 8) | nalUnit[index + 3];
      index += 4;

      // Read sub_layer_constraint_indicator_flags (48 bits)
      const subLayerHighConstraintFlags = (nalUnit[index] << 16) | (nalUnit[index + 1] << 8) | nalUnit[index + 2];
      const subLayerLowConstraintFlags =
        (nalUnit[index + 3] << 16) | (nalUnit[index + 4] << 8) | nalUnit[index + 5];
      subLayer.subLayerConstraintIndicatorFlags = {
        high: subLayerHighConstraintFlags,
        low: subLayerLowConstraintFlags,
      };
      index += 6;
    }
    if (profileTierLevel.subLayerLevelPresentFlag[i]) {
      // Read sub_layer_level_idc (1 byte)
      subLayer.subLayerLevelIDC = nalUnit[index];
      index++;
    }
    profileTierLevel.subLayers.push(subLayer);
  }

  // Calculate the total size of the profile_tier_level structure
  profileTierLevel.size = index;

  return profileTierLevel;
}

function decodeHrdParameters(
  nalUnit: Uint8Array,
  index: number,
  cprmsPresentFlag: boolean,
  maxSubLayersMinus1: number
) {
  const hrdParams: any = {};

  if (cprmsPresentFlag) {
    // Read nal_hrd_parameters_present_flag (1 bit) and vcl_hrd_parameters_present_flag (1 bit)
    hrdParams.nalHrdParametersPresentFlag = (nalUnit[index] >> 7) & 0x01;
    hrdParams.vclHrdParametersPresentFlag = (nalUnit[index] >> 6) & 0x01;
    index++;

    if (hrdParams.nalHrdParametersPresentFlag || hrdParams.vclHrdParametersPresentFlag) {
      // Read sub_pic_hrd_params_present_flag (1 bit)
      hrdParams.subPicHrdParamsPresentFlag = (nalUnit[index] >> 7) & 0x01;
      index++;

      if (hrdParams.subPicHrdParamsPresentFlag) {
        // Read tick_divisor_minus2 (8 bits)
        hrdParams.tickDivisorMinus2 = nalUnit[index];
        index++;

        // Read du_cpb_removal_delay_increment_length_minus1 (5 bits)
        hrdParams.duCpbRemovalDelayIncrementLengthMinus1 = (nalUnit[index] >> 3) & 0x1f;

        // Read sub_pic_cpb_params_in_pic_timing_sei_flag (1 bit)
        hrdParams.subPicCpbParamsInPicTimingSeiFlag = (nalUnit[index] >> 2) & 0x01;

        // Read dpb_output_delay_du_length_minus1 (5 bits)
        hrdParams.dpbOutputDelayDuLengthMinus1 = nalUnit[index] & 0x1f;
        index++;
      }

      // Read bit_rate_scale (4 bits) and cpb_size_scale (4 bits)
      hrdParams.bitRateScale = (nalUnit[index] >> 4) & 0x0f;
      hrdParams.cpbSizeScale = nalUnit[index] & 0x0f;
      index++;

      if (hrdParams.subPicHrdParamsPresentFlag) {
        // Read cpb_size_du_scale (4 bits)
        hrdParams.cpbSizeDuScale = (nalUnit[index] >> 4) & 0x0f;
        index++;
      }

      // Read initial_cpb_removal_delay_length_minus1 (5 bits)
      hrdParams.initialCpbRemovalDelayLengthMinus1 = (nalUnit[index] >> 3) & 0x1f;

      // Read au_cpb_removal_delay_length_minus1 (5 bits)
      hrdParams.auCpbRemovalDelayLengthMinus1 = (nalUnit[index] >> 2) & 0x1f;

      // Read dpb_output_delay_length_minus1 (5 bits)
      hrdParams.dpbOutputDelayLengthMinus1 = nalUnit[index] & 0x1f;
      index++;
    }
  }

  // For each sub-layer, read bit rate and CPB size
  hrdParams.subLayerHrdParameters = [];
  for (let i = 0; i <= maxSubLayersMinus1; i++) {
    const subLayerHrd: any = {};

    if (hrdParams.nalHrdParametersPresentFlag) {
      // Read nal_sub_layer_hrd_parameters for this sub-layer
      subLayerHrd.nalBitRate = (nalUnit[index] << 8) | nalUnit[index + 1];
      index += 2;
    }

    if (hrdParams.vclHrdParametersPresentFlag) {
      // Read vcl_sub_layer_hrd_parameters for this sub-layer
      subLayerHrd.vclBitRate = (nalUnit[index] << 8) | nalUnit[index + 1];
      index += 2;
    }

    hrdParams.subLayerHrdParameters.push(subLayerHrd);
  }

  // Calculate the total size of the HRD parameters
  hrdParams.size = index;

  return hrdParams;
}

function decodeSPS(nalUnit: Uint8Array): any {
  const sps: any = {};
  let index = 2; // Start after the NAL unit header

  // nal_unit_type (type 33 is SPS)
  const nalUnitType = (nalUnit[0] >> 1) & 0x3f;
  sps.nalUnitType = nalUnitType;

  // profile_tier_level(1)
  sps.spsVideoParameterSetID = nalUnit[index] & 0x0f; // 4 bits
  sps.spsMaxSubLayersMinus1 = (nalUnit[index] >> 4) & 0x07; // 3 bits
  index++;

  // Sequence parameter set information
  sps.spsSeqParameterSetID = (nalUnit[index] >> 4) & 0x0f; // 4 bits
  sps.chromaFormatIDC = nalUnit[index] & 0x03; // 2 bits
  index++;

  // Pic width and height
  sps.picWidthInLumaSamples = (nalUnit[index] << 8) | nalUnit[index + 1]; // 16 bits
  index += 2;
  sps.picHeightInLumaSamples = (nalUnit[index] << 8) | nalUnit[index + 1]; // 16 bits
  index += 2;

  // Bit depth
  sps.bitDepthLumaMinus8 = (nalUnit[index] >> 4) & 0x0f; // 4 bits
  sps.bitDepthChromaMinus8 = nalUnit[index] & 0x0f; // 4 bits
  index++;

  // Log2_max_pic_order_cnt_lsb_minus4
  sps.log2MaxPicOrderCntLsbMinus4 = nalUnit[index] & 0x0f; // 4 bits
  index++;

  // Max number of reference frames
  sps.maxNumRefFrames = nalUnit[index] & 0x1f; // 5 bits
  index++;

  // SPS flags
  sps.spsTemporalIdNestingFlag = (nalUnit[index] >> 7) & 0x01; // 1 bit
  index++;

  // Additional SPS fields
  sps.spsScalingListDataPresentFlag = (nalUnit[index] >> 7) & 0x01; // 1 bit
  index++;

  if (sps.spsScalingListDataPresentFlag) {
    // Assume decodeScalingListData exists
    sps.scalingListData = decodeScalingListData(nalUnit, index);
    index += sps.scalingListData.size; // Update index to skip the scaling list data
  }

  // Conformance window flag
  sps.conformanceWindowFlag = (nalUnit[index] >> 7) & 0x01; // 1 bit
  index++;

  if (sps.conformanceWindowFlag) {
    // sps.confWinLeftOffset = readUE(nalUnit, index);
    index += sps.confWinLeftOffset.lengthInBits;

    // sps.confWinRightOffset = readUE(nalUnit, index);
    index += sps.confWinRightOffset.lengthInBits;

    // sps.confWinTopOffset = readUE(nalUnit, index);
    index += sps.confWinTopOffset.lengthInBits;

    // sps.confWinBottomOffset = readUE(nalUnit, index);
    index += sps.confWinBottomOffset.lengthInBits;
  }

  // Timing information
  sps.vuiParametersPresentFlag = (nalUnit[index] >> 7) & 0x01; // 1 bit
  index++;

  if (sps.vuiParametersPresentFlag) {
    // Assume decodeVuiParameters exists
    sps.vuiParameters = decodeVuiParameters(nalUnit, index);
  }

  return sps;
}

function decodeScalingListData(nalUnit: Uint8Array, startIndex: number) {
  // Implement scaling list data decoding logic
}

function decodeVuiParameters(nalUnit: Uint8Array, startIndex: number) {
  // Implement VUI parameters decoding logic
}

function decodePPS(buffer: Uint8Array) {}

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
