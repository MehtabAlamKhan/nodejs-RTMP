import net from "net";
import { Buffer } from "buffer";
import Crypto from "node:crypto";
import * as AMFd from "../AMF/amf0Decoding";
import * as AMFe from "../AMF/amf0Encoding";
import fs from "node:fs";
import generateS0S1S2 from "./RtmpHandshake";
import * as essentials from "../Essentials";
import { generateID } from "../misc";
import {
  AudioCodeNames,
  AudioSampleRates,
  VideoCodecNames,
} from "../AudioVideo";

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

const RTMP_TYPE_ID_DATA = 20;
const RTMP_VERSION = 3;
const HANDSHAKE_SIZE = 1536;

const RTMP_CHUNK_TYPE_0 = 0; // 11-bytes: timestamp(3) + length(3) + stream type(1) + stream id(4)
const RTMP_CHUNK_TYPE_1 = 1; // 7-bytes: delta(3) + length(3) + stream type(1)
const RTMP_CHUNK_TYPE_2 = 2; // 3-bytes: delta(3)
const RTMP_CHUNK_TYPE_3 = 3; // 0-byte

const RTMP_CHANNEL_PROTOCOL = 2;
const RTMP_CHANNEL_INVOKE = 3;
const RTMP_CHANNEL_AUDIO = 4;
const RTMP_CHANNEL_VIDEO = 5;
const RTMP_CHANNEL_DATA = 6;

const RTMP_TYPE_AUDIO = 8;
const RTMP_TYPE_VIDEO = 9;
const RTMP_TYPE_DATA = 18; // AMF0

const FourCC_AV1 = Buffer.from("av01");
const FourCC_VP9 = Buffer.from("vp09");
const FourCC_HEVC = Buffer.from("hvc1");

const PacketTypeSequenceStart = 0;
const PacketTypeCodedFrames = 1;
const PacketTypeSequenceEnd = 2;
const PacketTypeCodedFramesX = 3;
const PacketTypeMetadata = 4;
const PacketTypeMPEG2TSSequenceStart = 5;

class RtmpSession {
  RTMP_IN_CHUNK_SIZE: number;
  RTMP_OUT_CHUNK_SIZE: number;
  ID: string;
  socket: net.Socket;
  ackSize: number;
  inAckSize: number;
  lastInAckSize: number;
  connectionState: number;
  thirdPacketRecieved: boolean;
  bodyLength: number;
  typeId: number;
  remaining: number;
  clientId: string;
  port: number | undefined;
  videoHeight: number;
  videoWidth: number;
  videoFps: number;
  videoCount: number;
  audioSampleRate: number;
  metaData: Buffer;
  aacSequenceHeader: Buffer;
  avcSequenceHeader: Buffer;
  audioCodec: number;
  audioCodecName: string;
  audioProfileName: string;
  audioChannels: number;
  videoCodec: number;
  videoCodecName: string;
  videoProfileName: string;
  videoLevel: number;
  parsedPacket: RTMP_Response_PacketType;
  publishStreamId: number;
  appName: string;
  playerStreamPath: string;
  playerStreamId: number;
  players: Set<Buffer>;
  streamCache: Set<Buffer>;

  constructor(socket: net.Socket) {
    this.clientId = socket.remoteAddress + ":" + socket.remotePort;
    this.port = socket.remotePort;
    this.socket = socket;
    this.thirdPacketRecieved = false;
    this.connectionState = 1;
    this.RTMP_IN_CHUNK_SIZE = 128;
    this.RTMP_OUT_CHUNK_SIZE = 60000;
    this.ID = generateID();
    this.socket = socket;
    this.ackSize = 0;
    this.inAckSize = 0;
    this.lastInAckSize = 0;
    this.bodyLength = 0;
    this.typeId = 0;
    this.remaining = 0;

    this.videoHeight = 0;
    this.videoWidth = 0;
    this.videoFps = 0;
    this.videoCount = 0;
    this.audioSampleRate = 0;
    this.metaData = Buffer.alloc(0);
    this.aacSequenceHeader = Buffer.alloc(0);
    this.avcSequenceHeader = Buffer.alloc(0);
    this.audioCodec = 0;
    this.audioCodecName = "";
    this.audioProfileName = "";
    this.audioChannels = 1;
    this.videoCodec = 0;
    this.videoCodecName = "";
    this.videoProfileName = "";
    this.videoLevel = 0;

    this.parsedPacket = {
      header: {
        bodyLength: 0,
        chunkStreamID: 0,
        fmtType: 0,
        streamID: 0,
        timestamp: 0,
        typeID: 0,
        timestampDelta: 0,
      },
      payload: Buffer.alloc(0),
    };
    this.publishStreamId = 0;
    this.appName = "";
    this.playerStreamPath = "";
    this.playerStreamId = 0;
    this.players = new Set();

    this.streamCache = new Set();

    essentials.streamSessions.set(this.ID, this);
  }
  start() {
    this.socket.on("data", this.onData.bind(this));
    this.socket.on("close", this.onClose.bind(this));
    this.socket.on("error", this.onError.bind(this));
    this.socket.on("timeout", this.onTimeout.bind(this));
  }

  onData(data: Buffer) {
    switch (this.connectionState) {
      case 1:
        const clientVersion = data[0];
        const clientTime = data.readUInt32BE(1);
        let s0s1s2 = generateS0S1S2(data.subarray(1));
        this.socket.write(s0s1s2);
        this.connectionState = 2;
        break;
      case 2:
        this.startParsingRtmpPackets(data);
        break;
    }
  }
  onClose() {}
  onError() {}
  onTimeout() {}

  startParsingRtmpPackets(data: Buffer) {
    const dataLength = data.length;
    let offSet = 0;
    if (!this.thirdPacketRecieved) {
      offSet += 1536;
      this.thirdPacketRecieved = true;
    }
    let rtmpHeader = this.createRtmpHeader();

    let payload: Buffer = Buffer.alloc(0);
    let uptoLength;
    while (offSet < dataLength) {
      if (this.remaining === 0) {
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
          this.bodyLength = rtmpHeader.bodyLength;
          this.typeId = rtmpHeader.typeID;
        } else if (rtmpHeader.fmtType === 1) {
          rtmpHeader.timestampDelta = data.readUIntBE(offSet, 3);
          rtmpHeader.bodyLength = data.readUIntBE(3 + offSet, 3);
          rtmpHeader.typeID = data[6 + offSet];
          offSet += 7;
          this.bodyLength = rtmpHeader.bodyLength;
          this.typeId = rtmpHeader.typeID;
        } else if (rtmpHeader.fmtType === 2) {
          rtmpHeader.timestampDelta = data.readUIntBE(offSet, 3);
          offSet += 3;
          rtmpHeader.bodyLength = this.bodyLength;
          rtmpHeader.typeID = this.typeId;
        } else if (rtmpHeader.fmtType === 3) {
          rtmpHeader.bodyLength = this.bodyLength;
          rtmpHeader.typeID = this.typeId;
        }

        this.remaining = this.bodyLength;
        payload = Buffer.alloc(0);
        uptoLength = Math.min(
          this.RTMP_IN_CHUNK_SIZE,
          dataLength - offSet,
          this.bodyLength
        );
      } else {
        offSet += 1;
        uptoLength = Math.min(
          this.RTMP_IN_CHUNK_SIZE,
          this.remaining,
          dataLength - offSet
        );
      }

      payload = Buffer.concat([
        payload,
        data.subarray(offSet, offSet + uptoLength),
      ]);
      offSet += uptoLength;
      this.remaining -= uptoLength;
      if (this.remaining <= 0) {
        this.parsedPacket.header = rtmpHeader;
        this.parsedPacket.payload = payload;
        this.publishStreamId = rtmpHeader.streamID;
        this.rtmpPayloadHandler(payload, rtmpHeader.typeID || this.typeId);
      }
    }
  }
  createRtmpHeader(): RTMP_HeaderType {
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

  rtmpPayloadHandler(payload: Buffer, typeID: number) {
    fs.appendFileSync(`./${this.port}.txt`, typeID.toString() + "\r\n");
    switch (typeID) {
      case 1: //RTMP_TYPE_SET_CHUNK_SIZE:
      // case 2: //RTMP_TYPE_ABORT
      // case 3: //RTMP_TYPE_ACKNOWLEDGEMENT:
      case 5: //RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE:
        return this.rtmpControlHandler(payload, typeID);
      // case 6: //RTMP_TYPE_SET_PEER_BANDWIDTH:
      //   return;
      // // case RTMP_TYPE_EVENT:
      // //   return 0 === this.rtmpEventHandler() ? -1 : 0;
      case 8: // case RTMP_TYPE_AUDIO
        return this.rtmpAudioHandler(payload);
      case 9: // case RTMP_TYPE_VIDEO
        return this.rtmpVideoHandler(payload);
      // case 17: // RTMP_TYPE_FLEX_MESSAGE:
      //   return; //rtmpInvokeHandler(payload.subarray(1));
      case 20: //RTMP_TYPE_INVOKE
        return this.rtmpInvokeHandler(payload);
      // case RTMP_TYPE_FLEX_STREAM: // AMF3
      case 18: //RTMP_TYPE_DATA
        return this.rtmpDataHandler(payload);
      default:
        return;
    }
  }
  rtmpControlHandler(data: Buffer, typeID: number) {
    switch (typeID) {
      case 1: //set chunk size
        this.RTMP_IN_CHUNK_SIZE = data.readUInt32BE(0);
      case 5:
        this.ackSize = data.readUInt32BE(0);
      default:
    }
  }
  rtmpAudioHandler(data: Buffer) {
    return;
    let format = data[0] >> 4;
    let sampleRate = (data[0] >> 2) & 3;
    let sampleSize = (data[0] >> 1) & 1;
    let channels = data[0] & 1;

    if (this.audioCodec == 0) {
      this.audioCodec = format;
      this.audioChannels = ++channels;
      this.audioSampleRate = AudioSampleRates[sampleRate];
      this.audioCodecName = AudioCodeNames[format];
    }

    if (format == 10 && data[0] == 0) {
      this.aacSequenceHeader = Buffer.alloc(data.length);
      data.copy(this.aacSequenceHeader);
      this.audioProfileName = "LC";
      this.audioSampleRate = 48000;
      this.audioChannels = 2;
    } else {
      this.audioChannels = data[11];
      this.audioSampleRate = 48000;
    }

    let packet = this.createRtmpPacket();
    packet.header.fmtType = RTMP_CHUNK_TYPE_0;
    packet.header.chunkStreamID = RTMP_CHANNEL_AUDIO;
    packet.header.typeID = RTMP_TYPE_AUDIO;
    packet.payload = data;
    packet.header.bodyLength = packet.payload.length;
    packet.header.timestamp = 0;
    let rtmpChunks = this.createRtmpChunks(packet);

    if (this.aacSequenceHeader != null && data[1] === 0) {
    } else {
      this.streamCache.add(rtmpChunks);
    }
  }

  rtmpVideoHandler(data: Buffer) {
    return;
    let isExHeader = ((data[0] >> 4) & 0b1000) !== 0;
    let frame_type = (data[0] >> 4) & 0b0111;
    let codec_id = data[0] & 0x0f;
    let packetType = data[0] & 0x0f;
    if (isExHeader) {
      if (packetType == PacketTypeMetadata) {
      } else if (packetType == PacketTypeSequenceEnd) {
      }
      let FourCC = data.subarray(1, 5);
      if (FourCC.compare(FourCC_HEVC) == 0) {
        codec_id = 12;
        if (packetType == PacketTypeSequenceStart) {
          data[0] = 0x1c;
          data[1] = 0;
          data[2] = 0;
          data[3] = 0;
          data[4] = 0;
        } else if (
          packetType == PacketTypeCodedFrames ||
          packetType == PacketTypeCodedFramesX
        ) {
          if (packetType == PacketTypeCodedFrames) {
            data = data.subarray(3);
          } else {
            data[2] = 0;
            data[3] = 0;
            data[4] = 0;
          }
          data[0] = (frame_type << 4) | 0x0c;
          data[1] = 1;
        }
      } else if (FourCC.compare(FourCC_AV1) == 0) {
        codec_id = 13;
        if (packetType == PacketTypeSequenceStart) {
          data[0] = 0x1d;
          data[1] = 0;
          data[2] = 0;
          data[3] = 0;
          data[4] = 0;
          // Logger.log("PacketTypeSequenceStart", payload.subarray(0, 16));
        } else if (packetType == PacketTypeMPEG2TSSequenceStart) {
          // Logger.log("PacketTypeMPEG2TSSequenceStart", payload.subarray(0, 16));
        } else if (packetType == PacketTypeCodedFrames) {
          // Logger.log("PacketTypeCodedFrames", payload.subarray(0, 16));
          data[0] = (frame_type << 4) | 0x0d;
          data[1] = 1;
          data[2] = 0;
          data[3] = 0;
          data[4] = 0;
        }
      } else {
        console.log(`unsupported extension header`);
        return;
      }
    }

    if (this.videoFps === 0) {
      if (this.videoCount++ === 0) {
        setTimeout(() => {
          this.videoFps = Math.ceil(this.videoCount / 5);
        }, 5000);
      }
    }

    if (codec_id == 7 || codec_id == 12 || codec_id == 13) {
      //cache avc sequence header
      if (frame_type == 1 && data[1] == 0) {
        this.avcSequenceHeader = Buffer.alloc(data.length);
        data.copy(this.avcSequenceHeader);
        //let info = AV.readAVCSpecificConfig(this.avcSequenceHeader);
        this.videoWidth = 3840;
        this.videoHeight = 2160;
        this.videoProfileName = "High";
        this.videoLevel = 5.2;
        //Logger.log(`[rtmp publish] avc sequence header`,this.avcSequenceHeader);
      }
    }

    if (this.videoCodec == 0) {
      this.videoCodec = codec_id;
      this.videoCodecName = VideoCodecNames[codec_id];
    }

    let packet = this.createRtmpPacket();
    packet.header.fmtType = RTMP_CHUNK_TYPE_0;
    packet.header.chunkStreamID = RTMP_CHANNEL_VIDEO;
    packet.header.typeID = RTMP_TYPE_VIDEO;
    packet.payload = data;
    packet.header.bodyLength = packet.payload.length;
    packet.header.timestamp = 0;
    let rtmpChunks = this.createRtmpChunks(packet);

    //cache gop
    if (this.streamCache != null) {
      if (frame_type == 1) {
        this.streamCache.clear();
      }
      if (
        (codec_id == 7 || codec_id == 12 || codec_id == 13) &&
        frame_type == 1 &&
        data[1] == 0
      ) {
        //skip avc sequence header
      } else {
        this.streamCache.add(rtmpChunks);
      }
    }
  }

  rtmpInvokeHandler(data: Buffer) {
    const invokeMessage = AMFd.decodeAmf0cmd(data);
    switch (invokeMessage.cmd) {
      case "connect":
        this.onConnect(invokeMessage);
        break;
      case "createStream":
        this.onCreateStream(invokeMessage);
        break;
      case "call":
        this.onCall(invokeMessage);
        break;
      case "publish":
        this.onPublish(invokeMessage);
        break;
      case "play":
        this.onPlay(invokeMessage);
        break;
      case "close":
      case "seek":
      case "pause":
      case "resume":
      case "bufferLength":
      case "appendBytes":
      case "appendBytesAction":
      case "getBytes":
      case "time":
      case "length":
      case "client":
      case "server":
      case "onMetaData":
      case "onCuePoint":
        break;
    }
  }

  rtmpDataHandler(data: Buffer) {
    let dataMessage = AMFd.decodeAmf0data(data);
    switch (dataMessage.cmd) {
      case "@setDataFrame":
        this.audioSampleRate = dataMessage.data.audioSampleRate;
        this.videoFps = dataMessage.data.framerate;
        this.videoHeight = dataMessage.data.height;
        this.videoWidth = dataMessage.data.width;

        this.audioChannels = dataMessage.data.stereo;

        let opt = {
          cmd: "onMetaData",
          dataObj: dataMessage.data,
        };

        let metaData = AMFe.encodeAmf0data(opt);
      // console.log(metaData);
    }
  }

  onConnect(invokeMessage: any) {
    this.appName = invokeMessage.cmdObj.app;
    this.sendWindowACK(5000000);
    this.setPeerBandwidth(5000000, 2);
    this.setChunkSize(this.RTMP_OUT_CHUNK_SIZE);
    this.respondConnect(invokeMessage);
  }
  onCreateStream(invokeMessage: any) {
    this.respondCreateStream(invokeMessage.transId);
  }
  onCall(invokeMessage: any) {}

  onPublish(invokeMessage: any) {
    //Do authentication with stream key and stream path
    let streamPath =
      "/" + this.appName + "/" + invokeMessage.streamKey.split("?")[0];

    essentials.publishers.set(streamPath, this.ID);
    this.respondPublish(
      this.publishStreamId,
      "status",
      "NetStream.Publish.Start",
      `${streamPath} is published.`
    );

    essentials.streamEvents.emit("postPublish", this.ID, streamPath);
  }

  onPlay(invokeMessage: any) {
    this.playerStreamPath = "/" + this.appName + "/" + invokeMessage.streamName;
    this.playerStreamId = this.parsedPacket.header.streamID;

    this.respondPlay();
    if (essentials.publishers.has(this.playerStreamPath)) {
      this.onStartPlay();
    } else {
      console.log(this.playerStreamPath + "NOT FOUND");
    }
  }

  respondPlay() {
    this.sendStreamStatus(0, this.playerStreamId);
    this.sendStatusMessage(
      this.playerStreamId,
      "status",
      "NetStream.Play.Reset",
      "Playing and resetting stream."
    );
    this.sendStatusMessage(
      this.playerStreamId,
      "status",
      "NetStream.Play.Start",
      "Started playing stream."
    );
    this.sendRtmpSampleAccess();
  }
  onStartPlay() {
    let streamerId = essentials.publishers.get(this.playerStreamPath);
    let streamer = essentials.streamSessions.get(streamerId);
    let players = streamer.players;
    players.add(this.ID);

    if (streamer.metaData != null) {
      let packet = this.createRtmpPacket();
      packet.header.fmtType = RTMP_CHUNK_TYPE_0;
      packet.header.chunkStreamID = RTMP_CHANNEL_DATA;
      packet.header.typeID = RTMP_TYPE_DATA;
      packet.payload = streamer.metaData;
      packet.header.bodyLength = packet.payload.length;
      packet.header.streamID = this.playerStreamId;
      let chunks = this.createRtmpChunks(packet);
      this.socket.write(chunks);
    }

    if (streamer.audioCodec === 10 || streamer.audioCodec === 13) {
      let packet = this.createRtmpPacket();
      packet.header.fmtType = RTMP_CHUNK_TYPE_0;
      packet.header.chunkStreamID = RTMP_CHANNEL_AUDIO;
      packet.header.typeID = RTMP_TYPE_AUDIO;
      packet.payload = streamer.aacSequenceHeader;
      packet.header.bodyLength = packet.payload.length;
      packet.header.streamID = this.playerStreamId;
      let chunks = this.createRtmpChunks(packet);
      this.socket.write(chunks);
    }

    if (
      streamer.videoCodec === 7 ||
      streamer.videoCodec === 12 ||
      streamer.videoCodec === 13
    ) {
      let packet = this.createRtmpPacket();
      packet.header.fmtType = RTMP_CHUNK_TYPE_0;
      packet.header.chunkStreamID = RTMP_CHANNEL_VIDEO;
      packet.header.typeID = RTMP_TYPE_VIDEO;
      packet.payload = streamer.avcSequenceHeader;
      packet.header.bodyLength = packet.payload.length;
      packet.header.streamID = this.playerStreamId;
      let chunks = this.createRtmpChunks(packet);
      this.socket.write(chunks);
    }

    if (streamer.streamCache != null) {
      for (let chunks of streamer.streamCache) {
        chunks.writeUInt32LE(this.playerStreamId, 8);
        this.socket.write(chunks);
      }
    }
  }

  sendRtmpSampleAccess() {}

  sendStreamStatus(st: number, id: number) {
    let buffer = Buffer.from("020000000000060400000000000000000000", "hex");
    buffer.writeUInt16BE(st, 12);
    buffer.writeUInt32BE(id, 14);
    this.socket.write(buffer);
  }

  sendStatusMessage(
    sid: number,
    level: string,
    code: string,
    description: string
  ) {
    let opt = {
      cmd: "onStatus",
      transId: 0,
      cmdObj: null,
      info: {
        level: level,
        code: code,
        description: description,
      },
    };
    this.encodeAndRespond(sid, opt);
  }
  sendACK(size: number) {
    let buffer = Buffer.from([2, 0, 0, 0, 0, 0, 4, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
    buffer.writeUInt32BE(size, 12);
    this.socket.write(buffer);
  }
  sendWindowACK(size: number) {
    let windowAckBuffer = Buffer.from([
      2, 0, 0, 0, 0, 0, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    windowAckBuffer.writeUInt32BE(size, 12);
    this.socket.write(windowAckBuffer);
  }
  setPeerBandwidth(size: number, type: number) {
    let peerBandBuffer = Buffer.from([
      2, 0, 0, 0, 0, 0, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    peerBandBuffer.writeUInt32BE(size, 12);
    //set peer bandwidth limit type
    peerBandBuffer[16] = type;
    this.socket.write(peerBandBuffer);
  }
  setChunkSize(size: number) {
    let chunkSizeBuffer = Buffer.from([
      2, 0, 0, 0, 0, 0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    chunkSizeBuffer.writeUInt32BE(size, 12);
    this.socket.write(chunkSizeBuffer);
  }
  respondConnect(invokeMessage: any) {
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
    this.encodeAndRespond(0, resOpt);
  }
  respondCreateStream(tid: number) {
    let resOpt = {
      cmd: "_result",
      transId: tid,
      cmdObj: null,
      info: 1,
    };
    this.encodeAndRespond(0, resOpt);
  }
  respondPublish(
    sid: number,
    level: string,
    code: string,
    description: string
  ) {
    let resOpt = {
      cmd: "onStatus",
      transId: sid,
      cmdObj: null,
      info: {
        level: level,
        code: code,
        description: description,
      },
    };
    this.encodeAndRespond(0, resOpt);
  }

  encodeAndRespond(sid: number, resOpt: any) {
    let resRtmpPacket = this.createRtmpPacket();
    resRtmpPacket.header.fmtType = RTMP_FMT_TYPE_0;
    resRtmpPacket.header.chunkStreamID = RTMP_CHANNEL_INVOKE;
    resRtmpPacket.header.typeID = RTMP_TYPE_ID_DATA;
    resRtmpPacket.header.streamID = sid;
    resRtmpPacket.payload = AMFe.encodeAmf0cmd(resOpt);
    resRtmpPacket.header.bodyLength = resRtmpPacket.payload.length;
    let chunks = this.createRtmpChunks(resRtmpPacket);
    this.socket.write(chunks);
  }
  createRtmpPacket() {
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

  createRtmpChunks(data: RTMP_Response_PacketType): Buffer {
    let header = data.header;
    let payload = data.payload;
    let payloadSize = data.header.bodyLength;
    let chunkSize = this.RTMP_OUT_CHUNK_SIZE;
    let chunkOffset = 0;
    let payloadOffset = 0;

    let chunkBasicHeader = this.createChunkBasicHeader(
      header.fmtType,
      header.chunkStreamID
    );
    let chunkBasicHeader3 = this.createChunkBasicHeader(
      RTMP_FMT_TYPE_3,
      header.chunkStreamID
    );
    let chunkMessageHeader = this.createChunkMessageHeader(header);

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

  createChunkBasicHeader(fmtType: number, chunkID: number): Buffer {
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

  createChunkMessageHeader(header: RTMP_HeaderType): Buffer {
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
}
export default RtmpSession;
