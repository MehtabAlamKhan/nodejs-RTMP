import net from "node:net";
import Crypto from "node:crypto";
import RtmpSession from "./RtmpSession";

import generateS0S1S2 from "./RtmpHandshake";

const RTMP_VERSION = 3;
const HANDSHAKE_SIZE = 1536;

class RtmpConnectionPool {
  static socket: net.Socket;
  static clientsConnected = new Map();
  static showAllConnectionsInterval: NodeJS.Timeout;

  constructor(socket: net.Socket) {
    RtmpConnectionPool.socket = socket;
  }

  start() {
    RtmpConnectionPool.socket.on("data", (data: Buffer) => {
      let clientId = getClientId(RtmpConnectionPool.socket);

      if (RtmpConnectionPool.clientsConnected.has(clientId)) {
        let client = RtmpConnectionPool.clientsConnected.get(clientId);
        client.session.onData(data, client);
      } else {
        createNewConnection(data, clientId);
      }
    });

    RtmpConnectionPool.socket.on("error", (error) => {
      // RtmpSession.socket.destroy();
      console.log(error);
    });
    RtmpConnectionPool.socket.on("end", () => {
      let clientId = getClientId(RtmpConnectionPool.socket);
      removeClient(clientId, RtmpConnectionPool.clientsConnected);
    });
    RtmpConnectionPool.socket.on("close", () => {
      let clientId = getClientId(RtmpConnectionPool.socket);
      removeClient(clientId, RtmpConnectionPool.clientsConnected);
    });
  }
}

function createNewConnection(data: Buffer, clientId: string) {
  const clientVersion = data[0];
  const clientTime = data.readUInt32BE(1);

  // const s0 = Buffer.from([RTMP_VERSION]);
  // const s1 = Buffer.alloc(HANDSHAKE_SIZE, Crypto.randomBytes(HANDSHAKE_SIZE));
  // const s2 = Buffer.alloc(HANDSHAKE_SIZE, Crypto.randomBytes(HANDSHAKE_SIZE));
  // s1.writeUInt32BE(clientTime, 0);
  // s2.writeUInt32BE(clientTime, 0);
  // s2.writeUInt32BE(clientTime, 4);
  // RtmpConnectionPool.socket.write(Buffer.concat([s0, s1, s2]));

  let s0s1s2 = generateS0S1S2(data.subarray(1));
  RtmpConnectionPool.socket.write(s0s1s2);

  RtmpConnectionPool.clientsConnected.set(clientId, {
    isStreaming: false,
    session: new RtmpSession(clientId, RtmpConnectionPool.socket),
  });

  // clearInterval(RtmpConnectionPool.showAllConnectionsInterval);
  // RtmpConnectionPool.showAllConnectionsInterval = setInterval(() => {
  //   console.log(RtmpConnectionPool.clientsConnected);
  // }, 1000);
}
function getClientId(socket: net.Socket): string {
  let clientId = "";
  clientId = socket.remoteAddress + ":" + socket.remotePort;
  return clientId;
}
function removeClient(clientId: string, connectionPool: Map<any, any>) {
  if (connectionPool.has(clientId)) {
    connectionPool.delete(clientId);
  }
}

export default RtmpConnectionPool;
