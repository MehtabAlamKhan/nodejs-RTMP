import { EventEmitter } from "stream";

class TransMuxingSession extends EventEmitter {
  constructor() {
    super();
  }

  run() {
    console.log("TRANSMUXING SERVER STARTED");
  }
}

export default TransMuxingSession;
