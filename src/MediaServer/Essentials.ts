import { EventEmitter } from "node:events";
import RtmpSession from "./RtmpServer/RtmpSession";

type streamEventsTypes = {
  postStreamStart: (id: string, streamPath: string) => void;
  postStreamEnd: (id: string) => void;
};

class streamCustomEvens extends EventEmitter {
  on<K extends keyof streamEventsTypes>(eventName: K, listener: streamEventsTypes[K]): this {
    return super.on(eventName, listener);
  }
  emit<K extends keyof streamEventsTypes>(eventName: K, ...args: Parameters<streamEventsTypes[K]>): boolean {
    return super.emit(eventName, ...args);
  }
}

let streamEvents = new streamCustomEvens();
let publishers = new Map();
let streamSessions = new Map<string, RtmpSession>();

export { streamEvents, streamSessions, publishers };
