function getClientDiffHellmanOffset(data: Buffer) {
  let offset = data[0] + data[1] + data[2] + data[3];
  offset = 632 % offset;
  offset = 772 + offset;
  return offset;
}

function getClientGenuineFPConstDigestOffset(data: Buffer) {
  let offset = data[0] + data[1] + data[2] + data[3];
  offset = 728 % offset;
  offset = 12 + offset;
}

function getMessageFormat(data: Buffer) {
  // Message Format 1:
  // 0:3        32-bit system time, network byte ordered (htonl)
  // 4:7        Server Version.  e.g. 0x09 0x0 0x7c 0x2 is 9.0.124.2
  // 8:11       Obfuscated pointer to "Genuine FMS" key
  // 12:1531    Random Data, 128-bit Diffie-Hellmann key and "Genuine FMS" key.
  // 1532:1535  Obfuscated pointer to 128-bit Diffie-Hellmann key
  let sdl = getClientGenuineFPConstDigestOffset;

  // Message Format 2:
  // 0:3        32-bit system time, network byte ordered (htonl)
  // 4:7        Server Version.  e.g. 0x09 0x0 0x7c 0x2 is 9.0.124.2
  // 8:767      Random Data and 128-bit Diffie-Hellmann key
  // 768:771    Obfuscated pointer to 128-bit Diffie-Hellmann key
  // 772:775    Obfuscated pointer to "Genuine FMS" key
  // 776:1535   Random Data and "Genuine FMS" key.
}
