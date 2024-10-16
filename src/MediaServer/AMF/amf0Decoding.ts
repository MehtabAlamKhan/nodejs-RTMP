type rtmpCodeType = {
  [key: string]: string[];
};
const rtmpCmdCode: rtmpCodeType = {
  releaseStream: ["transId", "cmdObj", "streamKey"],
  FCPublish: ["transId", "cmdObj", "streamKey"],
  FCUnpublish: ["transId", "cmdObj", "streamName"],
  connect: ["transId", "cmdObj", "args"],
  createStream: ["transId", "cmdObj"],
  publish: ["transId", "cmdObj", "streamKey", "type"],
  play: ["transId", "cmdObj", "streamName", "start", "duration", "reset"],
};
const rtmpDataCode: rtmpCodeType = {
  "@setDataFrame": ["method", "data"],
  onMetaData: ["dataObj"],
};

type amf0DecodingRulesType = {
  [key: number]: Function;
};
const amf0DecodingRules: amf0DecodingRulesType = {
  0x00: amf0decNumber,
  0x01: amf0decBool,
  0x02: amf0decString,
  0x03: amf0decObject,
  // //    0x04: amf0decMovie, // Reserved
  0x05: amf0decNull,
  // 0x06: amf0decUndefined,
  // 0x07: amf0decRef,
  0x08: amf0decArray,
  //   0x09: amf0decObjEnd,
  // 0x0A: amf0decSArray,
  // 0x0B: amf0decDate,
  // 0x0C: amf0decLongString,
  // //    0x0D: amf0decUnsupported, // Has been never originally implemented by Adobe!
  // //    0x0E: amf0decRecSet, // Has been never originally implemented by Adobe!
  // 0x0F: amf0decXmlDoc,
  // 0x10: amf0decTypedObj,
  // 0x11: amf0decSwitchAmf3
};

function amf0decArray(payload: Buffer) {
  let obj = amf0decObject(payload.subarray(4));
  return { len: 5 + obj.len, value: obj.value };
}

function amf0decNumber(payload: Buffer) {
  return { len: 9, value: payload.readDoubleBE(1) };
}
function amf0decBool(payload: Buffer) {
  return { len: 2, value: payload.readUint8(1) != 0 };
}
function amf0decNull(payload: Buffer) {
  return { len: 1, value: null };
}
function amf0decStringWithoutAMF(payload: Buffer) {
  const strLen = payload.readUInt16BE(0);
  return { len: 2 + strLen, value: payload.toString("utf-8", 2, strLen + 2) };
}
function amf0decString(payload: Buffer) {
  /* example
    input - {
        amfType : 1 byte,
        length : 2 bytes,
        value : string of length above
    }
    return - {
        value - string
        len - total length of the input
    }
    */
  const stringlen = payload.readUInt16BE(1);
  return {
    len: 1 + 2 + stringlen,
    value: payload.toString("utf-8", 3, 3 + stringlen),
  };
}
function amf0decObject(data: Buffer) {
  let res: { len: number; value: { [key: string]: string } } = {
    len: 0,
    value: {},
  };
  let value: { [key: string]: string } = {};

  var offset = 1;
  var totalLen = 1;
  var payload = data.subarray(1);
  while (payload.readUInt8(0) !== 0x09) {
    const key = amf0decStringWithoutAMF(payload);
    if (key.value === "") {
      totalLen += payload.length;
      break;
    }
    totalLen += key.len;
    payload = data.subarray(totalLen);
    const v = amf0DecodingRules[payload.readUInt8(0)](payload);
    totalLen += v.len;
    payload = data.subarray(totalLen);
    // console.log(key.value, v.value);
    value[key.value] = v.value;
  }
  res.len = totalLen;
  res.value = value;
  return res;
}

function decodeAmf0cmd(payload: Buffer) {
  type returnValueType = { len: number; value: string | any };

  let res: { [key: string]: string } = {};

  const cmd: returnValueType = amf0DecodingRules[payload.readUInt8(0)](payload);
  res.cmd = cmd.value;
  payload = payload.subarray(cmd.len);

  if (rtmpCmdCode[cmd.value]) {
    rtmpCmdCode[cmd.value].forEach((key) => {
      if (payload.length > 0) {
        // console.log(payload.length);
        let v: returnValueType = amf0DecodingRules[payload.readUint8(0)](payload);
        // console.log(payload.length);

        payload = payload.subarray(v.len);
        res[key] = v.value;
      }
    });
  }

  return res;
}

function decodeAmf0data(payload: Buffer) {
  type returnValueType = { len: number; value: string | any };

  let res: { [key: string]: any } = {};
  let cmd = amf0decString(payload);
  res.cmd = cmd.value;
  payload = payload.subarray(cmd.len);
  if (rtmpDataCode[cmd.value]) {
    rtmpDataCode[cmd.value].forEach((key) => {
      let v: returnValueType = amf0DecodingRules[payload.readUint8(0)](payload);
      payload = payload.subarray(v.len);
      res[key] = v.value;
    });
  }

  return res;
}

export { decodeAmf0cmd, decodeAmf0data };
