type rtmpCodeType = {
  [key: string]: string[];
};
const rtmpCmdCode: rtmpCodeType = {
  _result: ["transId", "cmdObj", "info"],
  publish: ["transId", "info"],
  onStatus: ["transId", "cmdObj", "info"],
  onMetaData: ["dataObj"],
};
const rtmpDataCode: rtmpCodeType = {
  onMetaData: ["dataObj"],
  "@setDataFrame": ["method", "dataObj"],
  "|RtmpSampleAccess": ["bool1", "bool2"],
};

type amf0EncodingRulesType = {
  [key: string]: Function;
};

const amf0EncodingRules: amf0EncodingRulesType = {
  string: amf0encString,
  integer: amf0encNumber,
  double: amf0encNumber,
  //   xml: amf0encXmlDoc,
  object: amf0encObject,
  //   array: amf0encArray,
  //   sarray: amf0encSArray,
  //   binary: amf0encString,
  boolean: amf0encBool,
  //   undefined: amf0encUndefined,
  null: amf0encNull,
};
function amf0encString(str: string) {
  let buffer = Buffer.alloc(3);
  buffer.writeUInt8(0x02, 0);
  buffer.writeUInt16BE(str.length, 1);
  return Buffer.concat([buffer, Buffer.from(str, "utf-8")]);
}
function amf0encStringWithoutAmf(str: string) {
  let buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(str.length, 0);
  return Buffer.concat([buffer, Buffer.from(str, "utf-8")]);
}
function amf0encNumber(num: number) {
  let buffer = Buffer.alloc(9);
  buffer.writeUInt8(0x00, 0);
  buffer.writeDoubleBE(num, 1);
  return buffer;
}
function amf0encObject(obj: { [key: string]: number | boolean | string }) {
  let data = Buffer.from([0x03]);
  for (var k in obj) {
    let value = obj[k];
    // console.log(k, value, amfType(value));
    data = Buffer.concat([data, amf0encStringWithoutAmf(k), amf0EncodingRules[amfType(value)](value)]);
  }
  let endOfObject = Buffer.alloc(1);
  endOfObject.writeUInt8(0x09);
  data = Buffer.concat([data, amf0encStringWithoutAmf(""), endOfObject]);
  return data;
}
function amf0encBool(bool: boolean) {
  let buffer = Buffer.alloc(2);
  buffer.writeUInt8(0x01, 0);
  buffer.writeUint8(bool ? 1 : 0, 1);
  return buffer;
}
function amf0encNull() {
  return Buffer.from([0x05]);
}
function amfType(value: any): string {
  let type = typeof value;

  if (value === null) return "null";
  if (type == "string") return "string";
  if (type == "number") {
    if (parseInt(value) == value) return "integer";
    return "double";
  }
  if (type == "boolean") return "boolean";
  if (type == "object") return "object";
  return "NOT FOUND";
}

function encodeAmf0cmd(options: any): Buffer {
  let data = amf0EncodingRules[typeof options.cmd](options.cmd);

  if (rtmpCmdCode[options.cmd]) {
    rtmpCmdCode[options.cmd].forEach((key: string) => {
      data = Buffer.concat([data, amf0EncodingRules[amfType(options[key])](options[key])]);
    });
  }
  return data;
}

function encodeAmf0data(options: any): Buffer {
  let data = amf0EncodingRules[typeof options.cmd](options.cmd);
  if (rtmpDataCode[options.cmd]) {
    rtmpDataCode[options.cmd].forEach((key) => {
      console.log(options[key]);

      data = Buffer.concat([data, amf0EncodingRules[amfType(options[key])](options[key])]);
    });
  }
  return data;
}

export { encodeAmf0cmd, encodeAmf0data };
