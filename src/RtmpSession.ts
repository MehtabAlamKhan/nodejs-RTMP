import net from "net";
import { Buffer } from "buffer";
import Crypto from "node:crypto";
import * as AMFd from "./AMF/amf0Decoding";
import * as AMFe from "./AMF/amf0Encoding";
import fs from "node:fs";
import RtmpConnectionPool from "./RtmpConnectionPool";

// RTMP Handshake constants

type RTMP_HeaderType = {
  fmtType: number;
  chunkStreamID: number;
  timestamp: number;
  timestampDelta?: number;
  bodyLength: number;
  typeID: number;
  streamID: number;
};

type RTMP_Response_PacketType = {
  header: RTMP_HeaderType;
  payload: Buffer;
};

type ClientConnDetailsType = {
  isStreaming: boolean;
  session: RtmpSession;
};

const RTMP_FMT_TYPE_0 = 0;
const RTMP_FMT_TYPE_1 = 1;
const RTMP_FMT_TYPE_2 = 2;
const RTMP_FMT_TYPE_3 = 3;

const RTMP_CHANNEL_INVOKE = 3;
const RTMP_TYPE_ID_DATA = 20;
const RTMP_VERSION = 3;
const HANDSHAKE_SIZE = 1536;

class RtmpSession {
  static RTMP_IN_CHUNK_SIZE = 128;
  static RTMP_OUT_CHUNK_SIZE = 60000;
  static socket: net.Socket;
  static ackSize = 0;
  static inAckSize = 0;
  static lastInAckSize = 0;
  static existingClientsConnected = new Map();
  static bodyLength = 0;
  static typeId = 0;
  static showAllConnectionsInterval: NodeJS.Timeout;
  static remaining = 0;
  static clientId = "";
  static port: number | undefined = 0;

  static videoHeight: 0;
  static videoWidth: 0;
  static videoFps: 0;
  static audioSampleRate: 0;
  static audioChannels: 0;

  constructor(clientId: string, socket: net.Socket) {
    RtmpSession.clientId = clientId;
    RtmpSession.port = socket.remotePort;
    RtmpSession.socket = socket;
  }

  onData(data: Buffer, clientConnDetails: ClientConnDetailsType) {
    startParsingRtmpPackets(data, clientConnDetails);
  }
}

function startParsingRtmpPackets(
  data: Buffer,
  clientConnDetails: ClientConnDetailsType
) {
  const dataLength = data.length;
  let offSet = 0;
  if (!clientConnDetails.isStreaming) {
    offSet += 1536;
    clientConnDetails.isStreaming = true;
  }
  let rtmpHeader = createRtmpHeader();

  let payload: Buffer = Buffer.alloc(0);
  let uptoLength;
  while (offSet < dataLength) {
    if (RtmpSession.remaining === 0) {
      rtmpHeader.fmtType = data[offSet] >> 6;
      rtmpHeader.chunkStreamID = data[offSet] & 63;
      offSet += 1;

      if (rtmpHeader.chunkStreamID == 0) {
        rtmpHeader.chunkStreamID = data[offSet] + 63;
        offSet += 1;
      } else if (rtmpHeader.chunkStreamID == 1) {
        rtmpHeader.chunkStreamID = 63 + data.readUInt16LE(offSet);
        offSet += 2;
      }

      if (rtmpHeader.fmtType === 0) {
        rtmpHeader.timestamp = data.readUIntBE(offSet, 3);
        rtmpHeader.bodyLength = data.readUIntBE(3 + offSet, 3);
        rtmpHeader.typeID = data[6 + offSet];
        rtmpHeader.streamID = data.readUIntLE(7 + offSet, 4);
        offSet += 11;
        RtmpSession.bodyLength = rtmpHeader.bodyLength;
        RtmpSession.typeId = rtmpHeader.typeID;
      } else if (rtmpHeader.fmtType === 1) {
        rtmpHeader.timestampDelta = data.readUIntBE(offSet, 3);
        rtmpHeader.bodyLength = data.readUIntBE(3 + offSet, 3);
        rtmpHeader.typeID = data[6 + offSet];
        offSet += 7;
        RtmpSession.bodyLength = rtmpHeader.bodyLength;
        RtmpSession.typeId = rtmpHeader.typeID;
      } else if (rtmpHeader.fmtType === 2) {
        rtmpHeader.timestampDelta = data.readUIntBE(offSet, 3);
        offSet += 3;
        rtmpHeader.bodyLength = RtmpSession.bodyLength;
        rtmpHeader.typeID = RtmpSession.typeId;
      } else if (rtmpHeader.fmtType === 3) {
        rtmpHeader.bodyLength = RtmpSession.bodyLength;
        rtmpHeader.typeID = RtmpSession.typeId;
      }

      RtmpSession.remaining = RtmpSession.bodyLength;
      payload = Buffer.alloc(0);
      uptoLength = Math.min(
        RtmpSession.RTMP_IN_CHUNK_SIZE,
        dataLength - offSet,
        RtmpSession.bodyLength
      );
    } else {
      offSet += 1;
      uptoLength = Math.min(
        RtmpSession.RTMP_IN_CHUNK_SIZE,
        RtmpSession.remaining,
        dataLength - offSet
      );
    }

    payload = Buffer.concat([
      payload,
      data.subarray(offSet, offSet + uptoLength),
    ]);
    offSet += uptoLength;
    RtmpSession.remaining -= uptoLength;
    if (RtmpSession.remaining <= 0) {
      rtmpPayloadHandler(payload, rtmpHeader.typeID || RtmpSession.typeId);
    }
  }
}
function createRtmpHeader(): RTMP_HeaderType {
  return {
    fmtType: 0,
    chunkStreamID: 0,
    timestampDelta: 0,
    timestamp: 0,
    bodyLength: 0,
    typeID: 0,
    streamID: 0,
  };
}

function rtmpPayloadHandler(payload: Buffer, typeID: number) {
  switch (typeID) {
    case 1: //RTMP_TYPE_SET_CHUNK_SIZE:
    // case 2: //RTMP_TYPE_ABORT
    // case 3: //RTMP_TYPE_ACKNOWLEDGEMENT:
    case 5: //RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE:
      return rtmpControlHandler(payload, typeID);
    // case 6: //RTMP_TYPE_SET_PEER_BANDWIDTH:
    //   return;
    // // case RTMP_TYPE_EVENT:
    // //   return 0 === this.rtmpEventHandler() ? -1 : 0;
    case 8: // case RTMP_TYPE_AUDIO
      return rtmpAudioHandler(payload);
    case 9: // case RTMP_TYPE_VIDEO
      return rtmpVideoHandler(payload);
    // case 17: // RTMP_TYPE_FLEX_MESSAGE:
    //   return; //rtmpInvokeHandler(payload.subarray(1));
    case 20: //RTMP_TYPE_INVOKE
      return rtmpInvokeHandler(payload);
    // case RTMP_TYPE_FLEX_STREAM: // AMF3
    case 18: //RTMP_TYPE_DATA
      return rtmpDataHandler(payload);
    default:
      return;
  }
}
function rtmpControlHandler(data: Buffer, typeID: number) {
  switch (typeID) {
    case 1: //set chunk size
      RtmpSession.RTMP_IN_CHUNK_SIZE = data.readUInt32BE(0);
    case 5:
      RtmpSession.ackSize = data.readUInt32BE(0);
    default:
  }
}
function rtmpAudioHandler(data: Buffer) {
  let format = data[0] >> 4;
  let sampleRate = (data[0] >> 2) & 3;
  let sampleSize = (data[0] >> 1) & 1;
  let channels = data[0] & 1;
}

function rtmpVideoHandler(data: Buffer) {}

function rtmpInvokeHandler(data: Buffer) {
  const invokeMessage = AMFd.decodeAmf0cmd(data);
  switch (invokeMessage.cmd) {
    //NetConnection Commands
    case "connect":
      onConnect(invokeMessage);
      break;
    case "createStream":
      onCreateStream(invokeMessage);
      break;
    case "call":
      onCall(invokeMessage);

    //NetStream Commands
    case "publish":
      onPublish(invokeMessage);
  }
}

function rtmpDataHandler(data: Buffer) {
  let dataMessage = AMFd.decodeAmf0data(data);
  switch (dataMessage.cmd) {
    case "@setDataFrame":
      RtmpSession.audioSampleRate = dataMessage.data.audioSampleRate;
      RtmpSession.videoFps = dataMessage.data.framerate;
      RtmpSession.videoHeight = dataMessage.data.height;
      RtmpSession.videoWidth = dataMessage.data.width;

      RtmpSession.audioChannels = dataMessage.data.stereo;

      let opt = {
        cmd: "onMetaData",
        dataObj: dataMessage.data,
      };

      let metaData = AMFe.encodeAmf0data(opt);
    // console.log(metaData);
  }
}

function onConnect(invokeMessage: any) {
  sendWindowACK(5000000);
  setPeerBandwidth(5000000, 2);
  setChunkSize(RtmpSession.RTMP_OUT_CHUNK_SIZE);
  respondConnect(invokeMessage);
}
function onCreateStream(invokeMessage: any) {
  respondCreateStream(invokeMessage.transId);
}
function onCall(invokeMessage: any) {}

function onPublish(invokeMessage: any) {
  //Do authentication with stream key and stream path
  respondPublish(invokeMessage.transId);
}

function sendACK(size: number) {
  let buffer = Buffer.from([2, 0, 0, 0, 0, 0, 4, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
  buffer.writeUInt32BE(size, 12);
  RtmpSession.socket.write(buffer);
}
function sendWindowACK(size: number) {
  let windowAckBuffer = Buffer.from([
    2, 0, 0, 0, 0, 0, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  windowAckBuffer.writeUInt32BE(size, 12);
  RtmpSession.socket.write(windowAckBuffer);
}
function setPeerBandwidth(size: number, type: number) {
  let peerBandBuffer = Buffer.from([
    2, 0, 0, 0, 0, 0, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  peerBandBuffer.writeUInt32BE(size, 12);
  //set peer bandwidth limit type
  peerBandBuffer[16] = type;
  RtmpSession.socket.write(peerBandBuffer);
}
function setChunkSize(size: number) {
  let chunkSizeBuffer = Buffer.from([
    2, 0, 0, 0, 0, 0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  chunkSizeBuffer.writeUInt32BE(size, 12);
  RtmpSession.socket.write(chunkSizeBuffer);
}
function respondConnect(invokeMessage: any) {
  let resOpt = {
    cmd: "_result",
    transId: invokeMessage.transId,
    cmdObj: {
      fmsVer: "FMS/3,0,1,123",
      capabilities: invokeMessage.cmdObj.capabilities || 31,
    },
    info: {
      level: "status",
      code: "NetConnection.Connect.Success",
      description: "Connection succeeded.",
      objectEncoding: invokeMessage.cmdObj.objectEncoding || 0,
    },
  };
  encodeAndRespond(0, resOpt);
}
function respondCreateStream(tid: number) {
  let resOpt = {
    cmd: "_result",
    transId: tid,
    cmdObj: null,
    info: 1,
  };
  encodeAndRespond(0, resOpt);
}
function respondPublish(tid: number) {
  let resOpt = {
    cmd: "onStatus",
    transId: tid,
    cmdObj: null,
    info: {
      level: "status",
      code: "NetStream.Publish.Start",
      description: "Publishing myStream started.",
    },
  };
  encodeAndRespond(0, resOpt);
}

function encodeAndRespond(sid: number, resOpt: any) {
  let resRtmpPacket = createRtmpPacket();
  resRtmpPacket.header.fmtType = RTMP_FMT_TYPE_0;
  resRtmpPacket.header.chunkStreamID = RTMP_CHANNEL_INVOKE;
  resRtmpPacket.header.typeID = RTMP_TYPE_ID_DATA;
  resRtmpPacket.header.streamID = sid;
  resRtmpPacket.payload = AMFe.encodeAmf0cmd(resOpt);
  resRtmpPacket.header.bodyLength = resRtmpPacket.payload.length;
  let chunks = createRtmpChunks(resRtmpPacket);
  RtmpSession.socket.write(chunks);
}
function createRtmpPacket() {
  var header: RTMP_HeaderType = {
    fmtType: 0,
    chunkStreamID: 0,
    timestamp: 0,
    bodyLength: 0,
    typeID: 0,
    streamID: 0,
  };
  return {
    header,
    payload: Buffer.alloc(0),
  };
}

function createRtmpChunks(data: RTMP_Response_PacketType): Buffer {
  let header = data.header;
  let payload = data.payload;
  let payloadSize = data.header.bodyLength;
  let chunkSize = RtmpSession.RTMP_OUT_CHUNK_SIZE;
  let chunkOffset = 0;
  let payloadOffset = 0;

  let chunkBasicHeader = createChunkBasicHeader(
    header.fmtType,
    header.chunkStreamID
  );
  let chunkBasicHeader3 = createChunkBasicHeader(
    RTMP_FMT_TYPE_3,
    header.chunkStreamID
  );
  let chunkMessageHeader = createChunkMessageHeader(header);

  let chunkBasicHeaderLength = chunkBasicHeader.length;
  let chunkMessageHeaderLength = chunkMessageHeader.length;
  let headerSize = chunkBasicHeaderLength + chunkMessageHeaderLength; // + extended timestamp
  let totalSize = headerSize + payloadSize;

  let buffer = Buffer.alloc(totalSize);
  chunkBasicHeader.copy(buffer, chunkOffset);
  chunkOffset += chunkBasicHeaderLength;
  chunkMessageHeader.copy(buffer, chunkOffset);
  chunkOffset += chunkMessageHeaderLength;

  while (payloadSize > 0) {
    if (payloadSize > chunkSize) {
    } else {
      payload.copy(
        buffer,
        chunkOffset,
        payloadOffset,
        payloadOffset + payloadSize
      );
      chunkOffset += payloadSize;
      payloadOffset += payloadSize;
      payloadSize -= payloadSize;
    }
  }

  return buffer;
}

function createChunkBasicHeader(fmtType: number, chunkID: number): Buffer {
  let basicHeader;
  if (chunkID >= 64 + 255) {
    basicHeader = Buffer.alloc(3);
    basicHeader[0] = (fmtType << 6) | 1;
    basicHeader.writeUInt16BE(chunkID - 63, 1);
  } else if (chunkID > 63) {
    basicHeader = Buffer.alloc(2);
    basicHeader[0] = fmtType << 6;
    basicHeader[1] = chunkID - 63;
  } else {
    basicHeader = Buffer.alloc(1);
    basicHeader[0] = (fmtType << 6) | chunkID;
  }
  return basicHeader;
}

function createChunkMessageHeader(header: RTMP_HeaderType): Buffer {
  let sizes = [11, 7, 3, 0];
  let buffer = Buffer.alloc(sizes[header.fmtType]);

  if (header.fmtType <= RTMP_FMT_TYPE_2) {
    buffer.writeUIntBE(header.timestamp, 0, 3);
  }
  if (header.fmtType <= RTMP_FMT_TYPE_1) {
    buffer.writeUIntBE(header.bodyLength, 3, 3);
    buffer.writeUInt8(header.typeID, 6);
  }
  if (header.fmtType === RTMP_FMT_TYPE_0) {
    buffer.writeInt32LE(header.streamID, 7);
  }
  return buffer;
}

export default RtmpSession;
