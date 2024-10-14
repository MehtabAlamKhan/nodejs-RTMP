import { EventEmitter } from "node:events";

let streamEvents = new EventEmitter();
let publishers = new Map();
let streamSessions = new Map();

export { streamEvents, streamSessions, publishers };
