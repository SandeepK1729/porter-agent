import { Buffer } from "node:buffer";

export enum FrameType {
  // Tunnel initialization
  TUNNEL_INIT = 0,

  // Requests
  REQUEST_START = 1,
  REQUEST_DATA = 2,
  REQUEST_END = 3,

  // Responses
  RESPONSE_START = 4,
  RESPONSE_DATA = 5,
  RESPONSE_END = 6,
}

export enum EventType {
  REQUEST_START = "request-start",
  REQUEST_DATA = "request-data",
  REQUEST_END = "request-end",
  RESPONSE_START = "response-start",
  RESPONSE_DATA = "response-data",
  RESPONSE_END = "response-end",
  
  UNKNOWN = "unknown-event",
}

const FrameName = {
  [FrameType.TUNNEL_INIT]: EventType.REQUEST_START, // Not really an event, but we can reuse the payload structure
  [FrameType.REQUEST_START]: EventType.REQUEST_START,
  [FrameType.REQUEST_DATA]: EventType.REQUEST_DATA,
  [FrameType.REQUEST_END]: EventType.REQUEST_END,
  [FrameType.RESPONSE_START]: EventType.RESPONSE_START,
  [FrameType.RESPONSE_DATA]: EventType.RESPONSE_DATA,
  [FrameType.RESPONSE_END]: EventType.RESPONSE_END,
}

export const getEventName = (type: FrameType): EventType => {
  if (type in FrameName) {
    return FrameName[type as FrameType];
  }
  return EventType.UNKNOWN;
}


type TunnelInitPayload = { tunnelId: string; };
export type ConnectionStartPayload = any;
type ConnectionDataPayload = Buffer;
type ConnectionEndPayload = undefined;

export type Frame =
  // Tunnel initialization frame
  | { type: FrameType.TUNNEL_INIT; requestId: "00000000"; payload: TunnelInitPayload; }
  // Request start or response start frame
  | { type: FrameType.REQUEST_START | FrameType.RESPONSE_START; requestId: string; payload: ConnectionStartPayload; }
  // Request data or response data frame
  | { type: FrameType.REQUEST_DATA | FrameType.RESPONSE_DATA; requestId: string; payload: ConnectionDataPayload; }
  // Request end or response end frame
  | { type: FrameType.REQUEST_END | FrameType.RESPONSE_END; requestId: string; payload?: ConnectionEndPayload; };

/**
 * Frame format:
 * [4 bytes length][1 byte type][8 bytes requestId][payload...]
 */
const encodeFrame = (frame: Frame): Buffer => {
  const payload =
    frame.payload instanceof Buffer
      ? frame.payload
      : frame.payload
        ? Buffer.from(JSON.stringify(frame.payload))
        : Buffer.alloc(0);

  const header = Buffer.alloc(13); // 4 + 1 + 8
  header.writeUInt32BE(payload.length + 9, 0); // total length = type(1) + requestId(8) + payload
  header.writeUInt8(frame.type, 4); // type
  header.write(frame.requestId, 5, 8, "hex"); // requestId

  return Buffer.concat([header, payload]); // final frame buffer
};

const decodeFrames = (buffer: Buffer) => {
  const frames: Frame[] = [];
  let offset = 0;

  while (buffer.length - offset >= 4) {
    const len = buffer.readUInt32BE(offset);
    if (buffer.length - offset < len + 4) break;

    const type = buffer.readUInt8(offset + 4); // type
    const requestId = buffer
      .slice(offset + 5, offset + 13)
      .toString("hex"); // 

    const payloadBuf = buffer.slice(offset + 13, offset + 4 + len);

    let payload: any = payloadBuf;
    if (
      type === FrameType.TUNNEL_INIT ||
      type === FrameType.REQUEST_START ||
      type === FrameType.RESPONSE_START
    ) {
      payload = JSON.parse(payloadBuf.toString());
    }

    frames.push({ type, requestId, payload });
    offset += len + 4;
  }

  return { frames, remaining: buffer.slice(offset) };
};

const decodeTunnelId = (buffer: Buffer): string => {
  const data = decodeFrames(buffer).frames[0];

  if (data?.type !== FrameType.TUNNEL_INIT) {
    throw new Error("Invalid frame type for tunnel ID");
  }

  return data.payload.tunnelId.toString();
}

export { encodeFrame, decodeFrames, decodeTunnelId };
