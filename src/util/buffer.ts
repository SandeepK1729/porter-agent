import { Buffer } from "node:buffer";

const LENGTH = {
  TYPE_ID: 1,
  REQUEST_ID: 8,
  LENGTH_FIELD: 4,
  TOTAL_FIELD: 13, // TYPE_ID + REQUEST_ID + LENGTH_FIELD
  TUNNEL_ID: 8,
};

export enum FrameType {
  REQUEST = 1,
  RESPONSE = 2,
}

const encodeFrame = (obj: {
  type: FrameType;
  requestId: string;
  payload: object;
}): Buffer => {
  const { type, requestId, payload } = obj;
  const body = Buffer.from(JSON.stringify(payload));
  const buf = Buffer.alloc(LENGTH.TOTAL_FIELD + body.length);

  buf.writeUInt8(type, 0);

  const reqIdBytes = Buffer.from(requestId, "utf8");
  reqIdBytes.copy(buf, LENGTH.TYPE_ID);

  buf.writeUInt32BE(body.length, LENGTH.TYPE_ID + LENGTH.REQUEST_ID);
  body.copy(buf, LENGTH.TOTAL_FIELD);
  return buf;
};

const decodeTunnelId = (buffer: Buffer): string =>
  buffer.slice(0, LENGTH.TUNNEL_ID).toString("utf8").trim();

const decodeFrames = (buffer: Buffer) => {
  let offset = 0;
  const frames: { type: FrameType; requestId: string; payload: any }[] = [];

  while (buffer.length - offset >= LENGTH.TOTAL_FIELD) {
    const type = buffer.readUInt8(offset);
    const requestId = buffer
      .slice(
        offset + LENGTH.TYPE_ID,
        offset + LENGTH.TYPE_ID + LENGTH.REQUEST_ID
      )
      .toString("utf8");
    const len = buffer.readUInt32BE(
      offset + LENGTH.TYPE_ID + LENGTH.REQUEST_ID
    );

    if ((buffer.length - offset) < (LENGTH.TOTAL_FIELD + len)) break;

    const body = buffer.slice(
      offset + LENGTH.TOTAL_FIELD,
      offset + LENGTH.TOTAL_FIELD + len
    );
    frames.push({ type, requestId, payload: JSON.parse(body.toString()) });
    offset += LENGTH.TOTAL_FIELD + len;
  }

  return { frames, remaining: buffer.slice(offset) };
};

export { encodeFrame, decodeFrames, decodeTunnelId };
