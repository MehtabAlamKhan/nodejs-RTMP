import { EventEmitter } from "node:events";

let streamEvents = new EventEmitter();
let streamSessions = new Map();

export { streamEvents, streamSessions };
