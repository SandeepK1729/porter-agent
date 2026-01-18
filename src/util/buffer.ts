import { Buffer } from "node:buffer";

const LENGTH = {
  LENGTH_FIELD: 4,
};

export enum FrameType {
  REQUEST = 1,
  RESPONSE = 2,
  REGISTERED = 3,
}

type Register = { type: FrameType.REGISTERED; tunnelId: string };
type Frame =
  | { type: FrameType.REQUEST; requestId: string; payload: any }
  | { type: FrameType.RESPONSE; requestId: string; payload: any }
  | Register;

const encodeFrame = (frame: Frame): Buffer => {
  const data = JSON.stringify(frame);
  const buf = Buffer.allocUnsafe(LENGTH.LENGTH_FIELD + Buffer.byteLength(data));

  buf.writeInt32BE(Buffer.byteLength(data), 0);
  Buffer.from(data).copy(buf, LENGTH.LENGTH_FIELD);

  console.log(`Encoded frame ${JSON.stringify(frame)} to buffer of length ${buf.length}`);
  return buf;
};

const decodeFrames = (buffer: Buffer) => {

  let offset = 0;
  let len = buffer.readInt32BE(0);
  const frames: Frame[] = [];

  while (buffer.length - offset <= LENGTH.LENGTH_FIELD + len) {
    const body = buffer.slice(offset + LENGTH.LENGTH_FIELD, offset + LENGTH.LENGTH_FIELD + len);
    frames.push(JSON.parse(body.toString()));
    offset += LENGTH.LENGTH_FIELD + len;

    if (buffer.length - offset < LENGTH.LENGTH_FIELD) break;
    len = buffer.readInt32BE(offset);
  }

  return { frames, remaining: buffer.slice(offset) };
}

const decodeTunnelId = (buffer: Buffer): string => {
  const data = decodeFrames(buffer).frames[0];

  if (data?.type !== FrameType.REGISTERED) {
    throw new Error("Invalid frame type for tunnel ID");
  }

  return data.tunnelId;
}

export { encodeFrame, decodeFrames, decodeTunnelId };
