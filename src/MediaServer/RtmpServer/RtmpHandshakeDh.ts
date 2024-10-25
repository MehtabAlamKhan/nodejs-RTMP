/* RTMP handshake using diffie hellman key exchange
   Author - Mehtab Alam Khan 2024 */

//to do (ignore this file)

import crypto from "node:crypto";

const MESSAGE_FORMAT_0 = 0;
const MESSAGE_FORMAT_1 = 1;
const MESSAGE_FORMAT_2 = 2;

const SHA256DigestLength = 32;
const RTMP_SIG_SIZE = 1536;

const dh = crypto.createDiffieHellman(2048);
const serverPublicKey = dh.getPublicKey();
const serverPrivateKey = dh.getPrivateKey();

function generateS0S1S2(sharedSecretKey: string, data: Buffer) {
  let version = Buffer.alloc(3, 1);
  let clientTimeStamp = data.readUInt32BE(0);
  let messageFormat = getMessageFormat(data);
}

function getMessageFormat(data: Buffer) {}
