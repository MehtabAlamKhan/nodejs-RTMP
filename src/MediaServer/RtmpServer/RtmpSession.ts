import "../Logger";
import net from "net";
import { Buffer } from "buffer";
import * as AMFd from "../AMF/amf0Decoding";
import * as AMFe from "../AMF/amf0Encoding";
import fs from "node:fs";
import generateS0S1S2 from "./RtmpHandshake";
import * as essentials from "../Essentials";
import { generateID } from "../misc";
import { AudioCodeNames, AudioSampleRates, codecSpecificConfiguration, VideoCodecNames } from "../AudioVideo";

// RTMP Handshake constants

type RTMP_HeaderType = {
  fmtType: number;
  chunkStreamID: number;
  timestamp: number;
  bodyLength: number;
  typeID: number;
  streamID: number;
};

type RTMP_PacketType = {
  bytes: number;
  clock: number;
  capacity: number;
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

const PARSE_LENGTH = 0;
const PARSE_BASIC_HEADER = 1;
const RTMP_PARSE_MESSAGE_HEADER = 2;
const PARSE_EXT_TIMESTMP = 3;
const PARSE_PAYLOAD = 4;

const RTMP_TYPE_ID_DATA = 20;
const RTMP_VERSION = 3;
const HANDSHAKE_SIZE = 1536;

const RTMP_MSG_HEADER_SIZE = [11, 7, 3, 0];

const C0C1_STATE = 0;
const C2_STATE = 1;
const HANDSHAKE_DONE = 2;

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

/* Data Message */
const RTMP_TYPE_FLEX_STREAM = 15; // AMF3

/* Shared Object Message */
const RTMP_TYPE_FLEX_OBJECT = 16; // AMF3
const RTMP_TYPE_SHARED_OBJECT = 19; // AMF0

/* Command Message */
const RTMP_TYPE_FLEX_MESSAGE = 17; // AMF3
const RTMP_TYPE_INVOKE = 20; // AMF0

const RTMP_TYPE_EVENT = 4;

const STREAM_BEGIN = 0x00;
const STREAM_END = 0x01;

const FourCC_AV1 = Buffer.from("av01");
const FourCC_VP9 = Buffer.from("vp09");
const FourCC_HEVC = Buffer.from("hvc1");

const FRAME_TYPE_SEQUENCE_START = 0;
const FRAME_TYPE_CODED_FRAMES = 1;
const FRAME_TYPE_SEQUENCE_END = 2;
const FRAME_TYPE_CODED_FRAMES_X = 3;
const FRAME_TYPE_METADATA = 4;
const FRAME_TYPE_MPEG2TS_SEQUNCE_START = 5;

class RtmpSession {
  RTMP_IN_CHUNK_SIZE: number;
  RTMP_OUT_CHUNK_SIZE: number;
  ID: string;
  socket: net.Socket;
  ackSize: number;
  inAckSize: number;
  lastInAckSize: number;
  connectionState: number;
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
  firstVideoPacketRecieved: boolean;
  aacSequenceHeader: Buffer;
  videoCodecSequenceHeader: Buffer;
  audioCodec: number;
  audioCodecName: string;
  audioProfileName: string;
  audioChannels: number;
  videoCodec: number;
  videoCodecName: string;
  videoProfileName: string;
  videoLevel: number;
  parsedPacket: RTMP_PacketType;
  appName: string;
  playerStreamId: number;
  publishStreamId: number;
  publishStreamPath: string;
  players: Set<string>;
  cachedFrames: number;
  streamCache: Set<Buffer>;
  inPackets: Map<number, RTMP_PacketType>;
  rtmpHeaderBuffer: Buffer;
  basicHeaderLength: number;
  parsingState: number;
  connectCmdObj: {};
  connectTime: Date;
  objectEncoding: number;
  startTimestamp: number;
  pingInterval!: NodeJS.Timeout;
  pingTimeMs: number;
  muxer: boolean;
  stopped: boolean;
  videoCodedData: Buffer;

  constructor(socket: net.Socket) {
    this.clientId = socket.remoteAddress + ":" + socket.remotePort;
    this.port = socket.remotePort;
    this.socket = socket;
    this.connectionState = C0C1_STATE;
    this.RTMP_IN_CHUNK_SIZE = 128;
    this.RTMP_OUT_CHUNK_SIZE = 60000;
    this.ID = generateID();
    this.stopped = false;
    this.muxer = false;
    this.socket = socket;
    this.ackSize = 0;
    this.inAckSize = 0;
    this.lastInAckSize = 0;
    this.bodyLength = 0;
    this.typeId = 0;
    this.remaining = 0;
    this.connectCmdObj = {};
    this.objectEncoding = 0;
    this.connectTime = new Date();
    this.startTimestamp = Date.now();
    this.pingTimeMs = 3000;
    this.rtmpHeaderBuffer = Buffer.alloc(18);
    this.basicHeaderLength = 0;
    this.firstVideoPacketRecieved = false;
    this.parsingState = 0;
    this.videoHeight = 0;
    this.videoWidth = 0;
    this.videoFps = 0;
    this.videoCount = 0;
    this.audioSampleRate = 0;
    this.metaData = Buffer.alloc(0);
    this.aacSequenceHeader = Buffer.alloc(0);
    this.videoCodecSequenceHeader = Buffer.alloc(0);
    this.videoCodedData = Buffer.alloc(0);
    this.audioCodec = 0;
    this.audioCodecName = "";
    this.audioProfileName = "";
    this.audioChannels = 1;
    this.videoCodec = 0;
    this.videoCodecName = "";
    this.videoProfileName = "";
    this.videoLevel = 0;

    this.parsedPacket = {
      bytes: 0,
      capacity: 0,
      clock: 0,
      header: {
        bodyLength: 0,
        chunkStreamID: 0,
        fmtType: 0,
        streamID: 0,
        timestamp: 0,
        typeID: 0,
      },
      payload: Buffer.alloc(0),
    };
    this.publishStreamId = 0;
    this.appName = "";
    this.publishStreamPath = "";
    this.playerStreamId = 0;

    this.players = new Set();
    this.cachedFrames = 0;
    this.streamCache = new Set();
    this.inPackets = new Map();

    essentials.streamSessions.set(this.ID, this);
  }
  start() {
    this.socket.on("data", this.onSocketData.bind(this));
    this.socket.on("close", this.onSocketClose.bind(this));
    this.socket.on("error", this.onSocketError.bind(this));
    this.socket.on("timeout", this.onSocketTimeout.bind(this));
    this.socket.setTimeout(25000);
  }

  onSocketData(data: Buffer) {
    switch (this.connectionState) {
      case C0C1_STATE:
        const clientProtocolVersion = data[0];
        const clientTime = data.readUInt32BE(1);
        let s0s1s2 = generateS0S1S2(data.subarray(1));
        this.socket.write(s0s1s2);
        this.connectionState = C2_STATE;
        break;
      case C2_STATE:
        this.startParsingRtmpPackets(data.subarray(1536));
        this.connectionState = HANDSHAKE_DONE;
        break;
      case HANDSHAKE_DONE:
      default:
        this.startParsingRtmpPackets(data);
        break;
    }
  }
  onSocketClose() {
    this.stop();
  }
  onSocketError() {
    this.stop();
  }
  onSocketTimeout() {
    this.stop();
  }

  startParsingRtmpPackets(data: Buffer) {
    let totalLength = data.length;
    let offSet = 0;
    let extendedTimestamp = 0;
    let size = 0;
    while (offSet < totalLength) {
      switch (this.parsingState) {
        case PARSE_LENGTH:
          this.rtmpHeaderBuffer[0] = data[offSet];
          let cid = data[offSet] & 63;
          offSet += 1;

          if (cid == 0) {
            this.basicHeaderLength = ++offSet;
          } else if (cid == 1) {
            offSet += 2;
            this.basicHeaderLength = offSet;
          } else {
            this.basicHeaderLength = 1;
          }
          this.parsingState = PARSE_BASIC_HEADER;
          break;
        case PARSE_BASIC_HEADER:
          size = RTMP_MSG_HEADER_SIZE[this.rtmpHeaderBuffer[0] >> 6];
          data.copy(this.rtmpHeaderBuffer, this.basicHeaderLength, offSet, offSet + size);
          offSet += size;
          this.rtmpPacketParse();
          this.parsingState = PARSE_EXT_TIMESTMP;
          break;

        case PARSE_EXT_TIMESTMP:
          size = RTMP_MSG_HEADER_SIZE[this.parsedPacket.header.fmtType] + this.basicHeaderLength;
          if (this.parsedPacket.header.timestamp === 0xffffff) {
            extendedTimestamp = this.rtmpHeaderBuffer.readUInt32BE(size);
            offSet += 4;
          } else {
            extendedTimestamp = this.parsedPacket.header.timestamp;
          }

          if (this.parsedPacket.bytes === 0) {
            if (this.parsedPacket.header.fmtType === RTMP_CHUNK_TYPE_0) {
              this.parsedPacket.clock = extendedTimestamp;
            } else {
              this.parsedPacket.clock += extendedTimestamp;
            }
            this.rtmpPacketAlloc();
          }
          this.parsingState = PARSE_PAYLOAD;
          break;

        case PARSE_PAYLOAD:
          size = Math.min(
            this.RTMP_IN_CHUNK_SIZE - (this.parsedPacket.bytes % this.RTMP_IN_CHUNK_SIZE),
            this.parsedPacket.header.bodyLength - this.parsedPacket.bytes
          );
          size = Math.min(size, totalLength - offSet);
          if (size > 0) {
            data.copy(this.parsedPacket.payload, this.parsedPacket.bytes, offSet, offSet + size);
          }
          this.parsedPacket.bytes += size;
          offSet += size;

          if (this.parsedPacket.bytes >= this.parsedPacket.header.bodyLength) {
            this.parsedPacket.bytes = 0;
            this.rtmpPayloadHandler();
            this.parsingState = PARSE_LENGTH;
          } else if (this.parsedPacket.bytes % this.RTMP_IN_CHUNK_SIZE === 0) {
            this.parsingState = PARSE_LENGTH;
          }
          break;
      }
    }
  }

  rtmpPacketParse() {
    let ftmType = this.rtmpHeaderBuffer[0] >> 6;
    let cid = 0;
    if (this.basicHeaderLength === 3) {
      cid = (this.rtmpHeaderBuffer[1] + 63 + this.rtmpHeaderBuffer[2]) << 8;
    } else if (this.basicHeaderLength === 2) {
      cid = this.rtmpHeaderBuffer[1] + 63;
    } else {
      cid = this.rtmpHeaderBuffer[0] & 63;
    }
    let p = this.inPackets.get(cid);
    if (p) {
      this.parsedPacket = p;
    } else {
      this.parsedPacket = this.createRtmpPacket(ftmType, cid);
      this.inPackets.set(cid, this.parsedPacket);
    }
    this.parsedPacket.header.fmtType = ftmType;
    this.parsedPacket.header.chunkStreamID = cid;
    this.readMessageHeader();
  }

  readMessageHeader() {
    let offset = this.basicHeaderLength;

    if (this.parsedPacket.header.fmtType <= 2) {
      this.parsedPacket.header.timestamp = this.rtmpHeaderBuffer.readUIntBE(offset, 3);
      offset += 3;
    }
    if (this.parsedPacket.header.fmtType <= 1) {
      this.parsedPacket.header.bodyLength = this.rtmpHeaderBuffer.readUIntBE(offset, 3);
      this.parsedPacket.header.typeID = this.rtmpHeaderBuffer[offset + 3];
      offset += 4;
    }
    if (this.parsedPacket.header.fmtType === 0) {
      this.parsedPacket.header.streamID = this.rtmpHeaderBuffer.readUInt32LE(offset);
    }
  }

  rtmpPacketAlloc() {
    let hbl = this.parsedPacket.header.bodyLength;
    if (this.parsedPacket.capacity < hbl) {
      this.parsedPacket.payload = Buffer.alloc(hbl + 1024);
      this.parsedPacket.capacity = hbl + 1024;
    }
  }

  createRtmpHeader(): RTMP_HeaderType {
    return {
      fmtType: 0,
      chunkStreamID: 0,
      timestamp: 0,
      bodyLength: 0,
      typeID: 0,
      streamID: 0,
    };
  }

  rtmpPayloadHandler() {
    let typeID = this.parsedPacket.header.typeID;
    let offset = this.parsedPacket.header.typeID === RTMP_TYPE_FLEX_MESSAGE ? 1 : 0;
    let payload = this.parsedPacket.payload.subarray(offset, offset + this.parsedPacket.header.bodyLength);
    // fs.appendFileSync(`./${this.port}.txt`, typeID.toString() + "\r\n");
    switch (typeID) {
      case 1: //RTMP_TYPE_SET_CHUNK_SIZE:
      // case 2: //RTMP_TYPE_ABORT
      // case 3: //RTMP_TYPE_ACKNOWLEDGEMENT:
      case 5: //RTMP_TYPE_WINDOW_ACKNOWLEDGEMENT_SIZE:
        return this.rtmpControlHandler(payload, typeID);
      case 4:
        return this.eventHandler();
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
        break;
      case 5:
        this.ackSize = data.readUInt32BE(0);
        break;
      default:
    }
  }
  eventHandler() {}

  rtmpAudioHandler(data: Buffer) {
    data = data.subarray(0, this.parsedPacket.header.bodyLength);
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

    if ((format == 10 || format == 13) && data[1] == 0) {
      this.aacSequenceHeader = Buffer.alloc(data.length);
      data.copy(this.aacSequenceHeader);
      if (format == 10) {
        this.audioProfileName = "LC";
        this.audioSampleRate = 48000;
        this.audioChannels = 2;
      } else {
        this.audioChannels = data[11];
        this.audioSampleRate = 48000;
      }
    }

    let packet = this.createRtmpPacket();
    packet.header.fmtType = RTMP_CHUNK_TYPE_0;
    packet.header.chunkStreamID = RTMP_CHANNEL_AUDIO;
    packet.header.typeID = RTMP_TYPE_AUDIO;
    packet.payload = data;
    packet.header.bodyLength = packet.payload.length;
    packet.header.timestamp = this.parsedPacket.clock;
    let rtmpChunks = this.createRtmpChunks(packet);

    if (this.aacSequenceHeader != null && data[1] === 0) {
    } else {
      this.streamCache.add(rtmpChunks);
    }

    for (let playerID of this.players) {
      let session = essentials.streamSessions.get(playerID);
      if (session) {
        if (session.cachedFrames === 0) {
          session.socket.cork();
        }
        rtmpChunks.writeUInt32LE(session.playerStreamId, 8);
        session.socket.write(rtmpChunks);
        session.cachedFrames++;
        if (session.cachedFrames >= 10) {
          process.nextTick(() => session.socket.uncork());
          session.cachedFrames = 0;
        }
      }
    }
  }

  rtmpVideoHandler(data: Buffer) {
    data = data.subarray(0, this.parsedPacket.header.bodyLength);
    let codecId = data[0] & 15;
    let isExHeader = data[0] >> 7;
    let keyFrame = (data[0] >> 4) & 0b0111;
    let videoPacketType = data[0] & 0b00001111;

    //set codecId if extended header
    if (isExHeader) {
      let FourCC = data.subarray(1, 5);
      if (FourCC.compare(FourCC_HEVC) == 0) codecId = 12;
      else if (FourCC.compare(FourCC_AV1) == 0) codecId = 13;
      else if (FourCC.compare(FourCC_VP9) == 0) codecId = 14;
      else {
        console.log("NEW CODEC O_O");
        return;
      }
    }

    if (videoPacketType == FRAME_TYPE_SEQUENCE_START || codecId == 7) {
      // get header details
      if (!this.firstVideoPacketRecieved && (codecId == 7 || codecId == 12 || codecId == 13 || codecId == 14)) {
        this.firstVideoPacketRecieved = true;
        this.videoCodec = codecId;
        this.videoCodecName = VideoCodecNames[codecId];
        if (codecId == 7) {
          this.videoCodecSequenceHeader = data.subarray(1);
        } else {
          this.videoCodecSequenceHeader = data.subarray(5);
        }
        let specs = codecSpecificConfiguration(this.videoCodecSequenceHeader, codecId);
        if (specs) {
          this.videoWidth = specs.width;
          this.videoHeight = specs.height;
          this.videoProfileName = specs.profile;
          this.videoLevel = specs.level;
        }

        // this.videoWidth = 3840;
        // this.videoHeight = 2160;
        // this.videoProfileName = "";
        // this.videoLevel = 0;
      }
    }

    if (videoPacketType == FRAME_TYPE_CODED_FRAMES) {
      this.videoCodedData = data.subarray(5);
    }
    if (videoPacketType == FRAME_TYPE_SEQUENCE_END) {
      //end of seuquence
    }

    if (videoPacketType == FRAME_TYPE_CODED_FRAMES_X) {
    }
    if (videoPacketType == FRAME_TYPE_METADATA) {
      // metadata
    }
    if (videoPacketType == FRAME_TYPE_MPEG2TS_SEQUNCE_START) {
    }

    let packet = this.createRtmpPacket();
    packet.header.fmtType = RTMP_CHUNK_TYPE_0;
    packet.header.chunkStreamID = RTMP_CHANNEL_VIDEO;
    packet.header.typeID = RTMP_TYPE_VIDEO;
    packet.payload = data;
    packet.header.bodyLength = packet.payload.length;
    packet.header.timestamp = this.parsedPacket.clock;
    let rtmpChunks = this.createRtmpChunks(packet);

    //cache gop
    if (this.streamCache != null) {
      if (videoPacketType == 1) {
        this.streamCache.clear();
      }
      if (
        (codecId == 7 || codecId == 12 || codecId == 13 || codecId == 14) &&
        videoPacketType == 1 &&
        !this.firstVideoPacketRecieved
      ) {
        //skip avc sequence header
        this.firstVideoPacketRecieved = true;
      } else {
        this.streamCache.add(rtmpChunks);
      }
    }

    for (let playerID of this.players) {
      let session = essentials.streamSessions.get(playerID);
      if (session) {
        if (session.cachedFrames === 0) {
          session.socket.cork();
        }
        rtmpChunks.writeUint32LE(session.playerStreamId, 8);
        session.socket.write(rtmpChunks);
        session.cachedFrames++;
        if (session.cachedFrames >= 10) {
          process.nextTick(() => session.socket.uncork());
          session.cachedFrames = 0;
        }
      }
    }
  }

  rtmpInvokeHandler(data: Buffer) {
    const invokeMessage = AMFd.decodeAmf0cmd(data);
    switch (invokeMessage.cmd) {
      case "connect":
        this.onConnect(invokeMessage);
        break;
      case "releaseStream":
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
      case "deleteStream":
        this.onDeleteStream(invokeMessage);
        break;
      case "play":
        this.onPlay(invokeMessage);
        break;
      case "pause":
        break;
      case "FCUnpublish":
        break;
      case "deleteStream":
        break;
      case "closeStream":
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

        this.metaData = AMFe.encodeAmf0data(opt);
        let packet = this.createRtmpPacket();
        packet.header.fmtType = RTMP_CHUNK_TYPE_0;
        packet.header.chunkStreamID = RTMP_CHANNEL_DATA;
        packet.header.typeID = RTMP_TYPE_DATA;
        packet.payload = this.metaData;
        packet.header.bodyLength = packet.payload.length;
        let rtmpChunks = this.createRtmpChunks(packet);

        for (let playerID of this.players) {
          let session = essentials.streamSessions.get(playerID);
          if (session) {
            rtmpChunks.writeUInt32LE(this.playerStreamId, 8);
            session.socket.write(rtmpChunks);
          }
        }

        break;
      // console.log(metaData);
    }
  }

  onConnect(invokeMessage: any) {
    this.appName = invokeMessage.cmdObj.app;
    essentials.streamEvents.emit("connect", invokeMessage);
    this.connectCmdObj = invokeMessage.cmdObj;
    this.appName = invokeMessage.cmdObj.app;
    this.objectEncoding = invokeMessage.cmdObj.objectEncoding != null ? invokeMessage.cmdObj.objectEncoding : 0;
    this.connectTime = new Date();
    this.startTimestamp = Date.now();
    this.pingInterval = setInterval(() => {
      this.sendPingRequest();
    }, this.pingTimeMs);
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
    let streamPath = "/" + this.appName + "/" + invokeMessage.streamKey.split("?")[0];
    this.publishStreamId = this.parsedPacket.header.streamID;

    if (essentials.publishers.has(streamPath)) {
      this.sendStatusMessage(
        this.publishStreamId,
        "error",
        "NetStream.Publish.BadName",
        "Stream already publishing"
      );
      return this.stop();
    }

    essentials.publishers.set(streamPath, this.ID);
    this.publishStreamPath = streamPath;
    this.sendStatusMessage(
      this.publishStreamId,
      "status",
      "NetStream.Publish.Start",
      `${streamPath} is published.`
    );

    essentials.streamEvents.emit("postStreamStart", this.ID, streamPath);
  }

  onPlay(invokeMessage: any) {
    this.publishStreamPath = "/" + this.appName + "/" + invokeMessage.streamName;
    this.playerStreamId = this.parsedPacket.header.streamID;
    this.muxer = true;
    this.respondPlay(this.playerStreamId);
    if (essentials.publishers.has(this.publishStreamPath)) {
      this.onStartPlay();
    } else {
      console.log(this.publishStreamPath + " NOT FOUND");
    }
  }
  onDeleteStream(invokeMessage: any) {
    if (invokeMessage.streamId == this.playerStreamId) {
      //its the Muxer/Transcoder
      //remove the muxer/transcoder from publishers players
      let publisherId = essentials.publishers.get(this.publishStreamPath);
      if (publisherId) {
        let session = essentials.publishers.get(publisherId);
        session?.players.delete(this.ID);
        essentials.streamSessions.delete(this.ID);
        console.log("MUXING DONE FOR STREAMPATH : " + session.publishStreamPath);
      }
      this.stopped = true;
    }
    if (invokeMessage.streamId == this.publishStreamId) {
      //its the streamer
      this.sendStatusMessage(
        this.publishStreamId,
        "status",
        "NetStream.Unpublish.Success",
        `${this.publishStreamPath} is now unpublished.`
      );
      for (let playerID of this.players) {
        let playerSession = essentials.streamSessions.get(playerID);
        if (playerSession) {
          playerSession.sendStatusMessage(
            playerSession.playerStreamId,
            "status",
            "NetStream.Play.UnpublishNotify",
            "stream is now unpublished."
          );
        }
        essentials.streamSessions.delete(playerID);
      }
      this.stopped = true;
      essentials.streamSessions.delete(this.ID);
      essentials.publishers.delete(this.publishStreamPath);
      essentials.streamEvents.emit("postStreamEnd", this.ID);
    }
  }

  respondPlay(sid: number) {
    this.sendStreamStatus(0, this.playerStreamId);
    this.sendStatusMessage(this.playerStreamId, "status", "NetStream.Play.Reset", "Playing and resetting stream.");
    this.sendStatusMessage(this.playerStreamId, "status", "NetStream.Play.Start", "Started playing stream.");
    this.sendRtmpSampleAccess(sid);
  }
  onStartPlay() {
    let streamerId = essentials.publishers.get(this.publishStreamPath);
    let streamer = essentials.streamSessions.get(streamerId);
    if (streamer) {
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
        streamer.videoCodec === 13 ||
        streamer.videoCodec === 14
      ) {
        let packet = this.createRtmpPacket();
        packet.header.fmtType = RTMP_CHUNK_TYPE_0;
        packet.header.chunkStreamID = RTMP_CHANNEL_VIDEO;
        packet.header.typeID = RTMP_TYPE_VIDEO;
        packet.payload = streamer.videoCodecSequenceHeader;
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
  }

  sendRtmpSampleAccess(sid: number) {
    let opt = {
      cmd: "|RtmpSampleAccess",
      bool1: false,
      bool2: false,
    };
    this.encodeAndRespondInvokeMsg(sid, opt);
  }

  sendStreamStatus(status: number, id: number) {
    let buffer = Buffer.from([2, 0, 0, 0, 0, 0, 6, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    buffer.writeUInt16BE(status, 12);
    buffer.writeUInt32BE(id, 14);
    this.socket.write(buffer);
  }

  sendStatusMessage(sid: number, level: string, code: string, description: string) {
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
    this.encodeAndRespondInvokeMsg(sid, opt);
  }
  sendPingRequest() {
    let currentTimestamp = Date.now() - this.startTimestamp;
    let packet = this.createRtmpPacket();
    packet.header.fmtType = RTMP_CHUNK_TYPE_0;
    packet.header.chunkStreamID = RTMP_CHANNEL_PROTOCOL;
    packet.header.typeID = RTMP_TYPE_EVENT;
    packet.header.timestamp = currentTimestamp;
    packet.payload = Buffer.from([
      0,
      6,
      (currentTimestamp >> 24) & 0xff,
      (currentTimestamp >> 16) & 0xff,
      (currentTimestamp >> 8) & 0xff,
      currentTimestamp & 0xff,
    ]);
    packet.header.bodyLength = packet.payload.length;
    let chunks = this.createRtmpChunks(packet);
    this.socket.write(chunks);
  }
  sendACK(size: number) {
    let buffer = Buffer.from([2, 0, 0, 0, 0, 0, 4, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
    buffer.writeUInt32BE(size, 12);
    this.socket.write(buffer);
  }
  sendWindowACK(size: number) {
    let windowAckBuffer = Buffer.from([2, 0, 0, 0, 0, 0, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0]);
    windowAckBuffer.writeUInt32BE(size, 12);
    this.socket.write(windowAckBuffer);
  }
  setPeerBandwidth(size: number, type: number) {
    let peerBandBuffer = Buffer.from([2, 0, 0, 0, 0, 0, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    peerBandBuffer.writeUInt32BE(size, 12);
    //set peer bandwidth limit type
    peerBandBuffer[16] = type;
    this.socket.write(peerBandBuffer);
  }
  setChunkSize(size: number) {
    let chunkSizeBuffer = Buffer.from([2, 0, 0, 0, 0, 0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
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
    this.encodeAndRespondInvokeMsg(0, resOpt);
  }
  respondCreateStream(tid: number) {
    let assignableStreamId;
    if (essentials.availableStreamIDs.nextReusableStreamID != null) {
      assignableStreamId = essentials.availableStreamIDs.nextReusableStreamID;
      essentials.availableStreamIDs.nextReusableStreamID = null;
    } else {
      assignableStreamId = essentials.availableStreamIDs.nextAvailableStreamID;
      essentials.availableStreamIDs.nextAvailableStreamID++;
    }
    let resOpt = {
      cmd: "_result",
      transId: tid,
      cmdObj: null,
      info: assignableStreamId,
    };
    this.encodeAndRespondInvokeMsg(0, resOpt);
  }
  respondPublish(sid: number, level: string, code: string, description: string) {
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
    this.encodeAndRespondInvokeMsg(0, resOpt);
  }

  encodeAndRespondInvokeMsg(sid: number, resOpt: any) {
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
  createRtmpPacket(fmt: number = 0, cid: number = 0): RTMP_PacketType {
    var header: RTMP_HeaderType = {
      fmtType: fmt,
      chunkStreamID: cid,
      timestamp: 0,
      bodyLength: 0,
      typeID: 0,
      streamID: 0,
    };
    return {
      capacity: 0,
      clock: 0,
      bytes: 0,
      header,
      payload: Buffer.alloc(0),
    };
  }

  createRtmpChunks(data: RTMP_PacketType): Buffer {
    let header = data.header;
    let payload = data.payload;
    let payloadSize = data.header.bodyLength;
    let chunkSize = this.RTMP_OUT_CHUNK_SIZE;
    let chunkOffset = 0;
    let payloadOffset = 0;

    let chunkBasicHeader = this.createChunkBasicHeader(header.fmtType, header.chunkStreamID);
    let chunkBasicHeader3 = this.createChunkBasicHeader(RTMP_FMT_TYPE_3, header.chunkStreamID);
    let chunkMessageHeader = this.createChunkMessageHeader(header);

    let useExtendedTimestamp = header.timestamp >= 0xffffff;

    let headerSize = chunkBasicHeader.length + chunkMessageHeader.length + (useExtendedTimestamp ? 4 : 0);
    let totalSize = headerSize + payloadSize + Math.floor(payloadSize / chunkSize);
    if (useExtendedTimestamp) {
      totalSize += Math.floor(payloadSize / chunkSize) * 4;
    }

    let buffer = Buffer.alloc(totalSize);
    chunkBasicHeader.copy(buffer, chunkOffset);
    chunkOffset += chunkBasicHeader.length;
    chunkMessageHeader.copy(buffer, chunkOffset);
    chunkOffset += chunkMessageHeader.length;

    while (payloadSize > 0) {
      if (payloadSize > chunkSize) {
        payload.copy(buffer, chunkOffset, payloadOffset, payloadOffset + chunkSize);
        payloadSize -= chunkSize;
        chunkOffset += chunkSize;
        payloadOffset += chunkSize;
        chunkBasicHeader3.copy(buffer, chunkOffset);
        chunkOffset += chunkBasicHeader3.length;
      } else {
        payload.copy(buffer, chunkOffset, payloadOffset, payloadOffset + payloadSize);
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
    let buffer = Buffer.alloc(RTMP_MSG_HEADER_SIZE[header.fmtType]);

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

  stop() {
    if (this.muxer) {
      let publisherID = essentials.publishers.get(this.publishStreamPath);
      if (publisherID) {
        let session = essentials.streamSessions.get(publisherID);
        session?.socket.destroy();
      }
    } else {
    }
    essentials.streamSessions.delete(this.ID);
    essentials.publishers.delete(this.publishStreamPath);
    this.stopped = true;
    this.socket.destroy();
  }
}
export default RtmpSession;
