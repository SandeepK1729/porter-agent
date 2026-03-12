import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import { encodeFrame, decodeFrames, decodeTunnelId, FrameType } from "./buffer";

// The requestId field in the wire format is 8 bytes (16 hex chars).
// When encoding a shorter hex string, the remaining bytes are zero-padded.
const padRequestId = (id: string) => id.padEnd(16, "0");

describe("encodeFrame / decodeFrames round-trip", () => {
  it("encodes and decodes a TUNNEL_INIT frame", () => {
    const tunnelId = "abc12345";
    const frame = {
      type: FrameType.TUNNEL_INIT as const,
      requestId: "00000000" as const,
      payload: { tunnelId },
    };

    const encoded = encodeFrame(frame);
    const { frames, remaining } = decodeFrames(encoded);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.type).toBe(FrameType.TUNNEL_INIT);
    expect(frames[0]!.requestId).toBe(padRequestId("00000000"));
    expect((frames[0]! as typeof frame).payload.tunnelId).toBe(tunnelId);
    expect(remaining.length).toBe(0);
  });

  it("encodes and decodes a REQUEST_START frame", () => {
    const requestId = "deadbeef";
    const frame = {
      type: FrameType.REQUEST_START as const,
      requestId,
      payload: { method: "GET", path: "/health", headers: {} },
    };

    const encoded = encodeFrame(frame);
    const { frames } = decodeFrames(encoded);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.type).toBe(FrameType.REQUEST_START);
    expect(frames[0]!.requestId).toBe(padRequestId(requestId));
  });

  it("encodes and decodes a REQUEST_DATA frame with binary payload", () => {
    const requestId = "cafebabe";
    const payload = Buffer.from("hello world");
    const frame = {
      type: FrameType.REQUEST_DATA as const,
      requestId,
      payload,
    };

    const encoded = encodeFrame(frame);
    const { frames } = decodeFrames(encoded);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.type).toBe(FrameType.REQUEST_DATA);
    expect((frames[0] as typeof frame).payload.toString()).toBe("hello world");
  });

  it("encodes and decodes a REQUEST_END frame with no payload", () => {
    const requestId = "00ff00ff";
    const frame = {
      type: FrameType.REQUEST_END as const,
      requestId,
    };

    const encoded = encodeFrame(frame);
    const { frames } = decodeFrames(encoded);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.type).toBe(FrameType.REQUEST_END);
    expect(frames[0]!.requestId).toBe(padRequestId(requestId));
  });

  it("decodes multiple concatenated frames correctly", () => {
    const frame1 = encodeFrame({
      type: FrameType.REQUEST_START,
      requestId: "aabbccdd",
      payload: { method: "POST", path: "/data", headers: {} },
    });
    const frame2 = encodeFrame({
      type: FrameType.REQUEST_END,
      requestId: "aabbccdd",
    });

    const { frames, remaining } = decodeFrames(Buffer.concat([frame1, frame2]));

    expect(frames).toHaveLength(2);
    expect(frames[0]!.type).toBe(FrameType.REQUEST_START);
    expect(frames[1]!.type).toBe(FrameType.REQUEST_END);
    expect(remaining.length).toBe(0);
  });

  it("returns remaining bytes when buffer is incomplete", () => {
    const encoded = encodeFrame({
      type: FrameType.REQUEST_END,
      requestId: "11223344",
    });

    // Truncate the buffer so it's incomplete
    const truncated = encoded.slice(0, encoded.length - 2);
    const { frames, remaining } = decodeFrames(truncated);

    expect(frames).toHaveLength(0);
    expect(remaining.length).toBe(truncated.length);
  });
});

describe("decodeTunnelId", () => {
  it("extracts the tunnelId from a TUNNEL_INIT frame buffer", () => {
    const expectedTunnelId = "my-tunnel-99";
    const encoded = encodeFrame({
      type: FrameType.TUNNEL_INIT,
      requestId: "00000000",
      payload: { tunnelId: expectedTunnelId },
    });

    expect(decodeTunnelId(encoded)).toBe(expectedTunnelId);
  });

  it("throws when buffer does not start with a TUNNEL_INIT frame", () => {
    const notTunnelInit = encodeFrame({
      type: FrameType.REQUEST_START,
      requestId: "deadbeef",
      payload: { method: "GET", path: "/", headers: {} },
    });

    expect(() => decodeTunnelId(notTunnelInit)).toThrow(
      "Invalid frame type for tunnel ID"
    );
  });
});
