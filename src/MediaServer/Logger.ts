import * as essentials from "./Essentials";

essentials.streamEvents.on("connect", logConnect);

function logConnect(invokeMessage: {}) {
  console.log("CONNECT");
}
