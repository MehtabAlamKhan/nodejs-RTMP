import * as essentials from "../Essentials";
import TransMuxingSession from "./TransMuxingSession";

class TransMuxingServer {
  constructor() {}

  run() {
    essentials.streamEvents.on("postPublish", this.onPostPublish.bind(this));
  }

  onPostPublish(id: string, streamPath: string) {
    console.log("POST PUBLISH FIRED");
    let session = new TransMuxingSession();
    session.run();
  }
}

export default TransMuxingServer;
