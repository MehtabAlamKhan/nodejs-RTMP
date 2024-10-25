/* RTMP handshake using HMAC and predefined
   secret keys FMSConst and FPConst
   Author - Mehtab Alam Khan 2024 */

import Crypto from "node:crypto";

const MESSAGE_FORMAT_0 = 0;
const MESSAGE_FORMAT_1 = 1;
const MESSAGE_FORMAT_2 = 2;

const SHA256Digestlength = 32;
const RTMP_BUFFER_SIZE = 1536;

const ServerFMSConst = "Genuine Adobe Flash Media Server 001";
const ServerFMSConstBuffer = Buffer.concat([Buffer.from(ServerFMSConst, "utf-8"), Crypto.randomBytes(32)]);

const ClientFPConst = "Genuine Adobe Flash Player 001";
const ClientFPConstBuffer = Buffer.concat([Buffer.from(ClientFPConst, "utf-8"), Crypto.randomBytes(32)]);

function generateS0S1S2(data: Buffer) {
  let version = Buffer.alloc(1, 3);
  let clientTimeInt = data.readUInt32BE(0);
  let messageFormat = getMessageFormat(data);

  if (messageFormat === MESSAGE_FORMAT_0) {
    return Buffer.concat([version, data, data]);
  }

  let res = Buffer.concat([version, genS1(messageFormat), genS2(messageFormat, data)]);
  return res;
}

function getMessageFormat(data: Buffer) {
  // Message Format 2:
  // 0:3        32-bit system time, network byte ordered (htonl)
  // 4:7        Server Version.  e.g. 0x09 0x0 0x7c 0x2 is 9.0.124.2
  // 8:767      Random Data and 128-bit Diffie-Hellmann key
  // 768:771    Obfuscated pointer to 128-bit Diffie-Hellmann key
  // 772:775    Obfuscated pointer to "Genuine FMS" key
  // 776:1535   Random Data and "Genuine FMS" key.
  let sdl = GetServerGenuineFMSConstDigestOffset(data.subarray(772, 776));
  let message = Buffer.concat([data.subarray(0, sdl), data.subarray(SHA256Digestlength + sdl)], 1504);
  let calculatedHmac = calcHmac(message, ClientFPConst);
  let providedHmac = data.subarray(sdl, sdl + SHA256Digestlength);
  if (calculatedHmac.equals(providedHmac)) {
    return MESSAGE_FORMAT_2;
  }

  // Message Format 1:
  // 0:3        32-bit system time, network byte ordered (htonl)
  // 4:7        Server Version.  e.g. 0x09 0x0 0x7c 0x2 is 9.0.124.2
  // 8:11       Obfuscated pointer to "Genuine FMS" key
  // 12:1531    Random Data, 128-bit Diffie-Hellmann key and "Genuine FMS" key.
  // 1532:1535  Obfuscated pointer to 128-bit Diffie-Hellmann key
  sdl = GetClientGenuineFPConstDigestOffset(data.subarray(8, 12));
  message = Buffer.concat([data.subarray(0, sdl), data.subarray(sdl + SHA256Digestlength)], 1504);
  calculatedHmac = calcHmac(message, ClientFPConst);
  providedHmac = data.subarray(sdl, sdl + SHA256Digestlength);
  if (calculatedHmac.equals(providedHmac)) {
    return MESSAGE_FORMAT_1;
  }
  return MESSAGE_FORMAT_0;
}

function GetServerGenuineFMSConstDigestOffset(data: Buffer) {
  let offset = data[0] + data[1] + data[2] + data[3];
  offset = (offset % 728) + 776;
  return offset;
}

function GetClientGenuineFPConstDigestOffset(data: Buffer) {
  let offset = data[0] + data[1] + data[2] + data[3];
  offset = (offset % 728) + 12;
  return offset;
}

function calcHmac(data: Buffer, key: string | Buffer) {
  return Crypto.createHmac("sha256", key).update(data).digest();
}

function genS1(msgFmt: number) {
  let res = Buffer.concat(
    [Buffer.from([0, 0, 0, 0, 1, 2, 3, 4]), Crypto.randomBytes(RTMP_BUFFER_SIZE - 8)],
    RTMP_BUFFER_SIZE
  );
  let sdo;
  if (msgFmt === 1) {
    // 8 - 11 should be the hashed key
    sdo = GetClientGenuineFPConstDigestOffset(res.subarray(8, 12));
  } else {
    // 772 - 775
    sdo = GetServerGenuineFMSConstDigestOffset(res.subarray(772, 776));
  }
  let msg = Buffer.concat(
    [res.subarray(0, sdo), res.subarray(sdo + SHA256Digestlength)],
    RTMP_BUFFER_SIZE - SHA256Digestlength
  );
  let hash = calcHmac(msg, ServerFMSConst);
  hash.copy(res, sdo, 0, 32);
  return res;
}
function genS2(msgFmt: number, data: Buffer) {
  let res = Crypto.randomBytes(RTMP_BUFFER_SIZE - 32);
  let sdo;
  if (msgFmt === 1) {
    sdo = GetClientGenuineFPConstDigestOffset(data.subarray(8, 12));
  } else {
    sdo = GetServerGenuineFMSConstDigestOffset(data.subarray(772, 776));
  }
  let msg = res.subarray(sdo, sdo + SHA256Digestlength);
  let hash = calcHmac(msg, ServerFMSConstBuffer);
  let sig = calcHmac(res, hash);
  return Buffer.concat([res, sig], RTMP_BUFFER_SIZE);
}

export default generateS0S1S2;
