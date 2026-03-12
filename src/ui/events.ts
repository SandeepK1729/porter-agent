import { EventEmitter } from "node:events";

const agentEvents = new EventEmitter();
agentEvents.setMaxListeners(100);

export { agentEvents };
