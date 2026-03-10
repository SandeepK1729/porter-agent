import http from "node:http";
import { Socket } from "node:net";
import { decodeFrames, decodeTunnelId, encodeFrame, Frame, FrameType } from "./buffer";
import { publicUrl } from "@/config";
import { agentEvents } from "@/ui/events";

const requests = new Map<string, http.ClientRequest>();

const upgradeHandler =
  (localPort: string) => (res: http.IncomingMessage, socket: Socket) => {

    let tunnelId: string | null = null;
    let buffer = Buffer.alloc(0);

    console.log("🚀 Agent connected");

    socket.on("data", (chunk) => {
      if (!tunnelId) {
        tunnelId = decodeTunnelId(Buffer.concat([buffer, chunk]));
        console.log(
          `⬇️ Forwarding ${publicUrl.replace("{tunnelId}", tunnelId)} -> http://localhost:${localPort}`,
        );
        buffer = Buffer.alloc(0);
        return;
      }

      const { frames, remaining } = decodeFrames(
        Buffer.concat([buffer, chunk]),
      );
      buffer = remaining;

      frames.forEach((frame) => {
        if (
          frame.type < FrameType.REQUEST_START ||
          frame.type > FrameType.REQUEST_END
        )
          return;

        if (frame.type === FrameType.REQUEST_START) {
          const options = {
            host: "localhost",
            port: parseInt(localPort, 10),
            method: frame.payload.method,
            path: frame.payload.path,
            headers: sanitizeHeaders(frame.payload.headers, localPort),
          };

          // console.log(`➡️  Incoming request for tunnel ${tunnelId}: `, options);
          // Using ANSI escape codes
          console.log(
            `- \x1b[32m${options.method}\x1b[0m \x1b[34m${options.path}\x1b[0m`,
          );

          tunnelFrame({
            requestId: frame.requestId,
            type: FrameType.REQUEST_START,
            payload: frame.payload,
          });

          const proxy = http.request(options, (res) => {

            // send response start
            tunnelFrame({
              requestId: frame.requestId,
              type: FrameType.RESPONSE_START,
              payload: {
                status: res.statusCode || 500,
                headers: res.headers,
              },
            });

            // pipe response data
            res.on("data", (c: Buffer) => {
              // send response data
              tunnelFrame({
                requestId: frame.requestId,
                type: FrameType.RESPONSE_DATA,
                payload: c,
              });

            });

            // response end
            res.on("end", () => {
              tunnelFrame({
                requestId: frame.requestId,
                type: FrameType.RESPONSE_END,
              });
            });
          });

          proxy.on("error", (err) => {
            tunnelFrame({
              requestId: frame.requestId,
              type: FrameType.RESPONSE_START,
              payload: {
                status: 502,
                headers: {},
                body: "Bad Gateway: " + err.message,
              },
            });

            tunnelFrame({
              requestId: frame.requestId,
              type: FrameType.RESPONSE_END,
            });
          });

          requests.set(frame.requestId, proxy);
        } else if (frame.type === FrameType.REQUEST_DATA) {
          tunnelFrame({
            requestId: frame.requestId,
            type: FrameType.REQUEST_DATA,
            payload: frame.payload,
          });
          requests.get(frame.requestId)?.write(frame.payload);
        } else if (frame.type === FrameType.REQUEST_END) {
          tunnelFrame({
            requestId: frame.requestId,
            type: FrameType.REQUEST_END,
          });
          requests.get(frame.requestId)?.end();
          requests.delete(frame.requestId);
        }
      });
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err);
    });

    socket.on("close", () => {
      console.log("🚪 Agent disconnected");
    });

    const tunnelFrame = (frame: Frame) => {
      // Only allow response frames to be sent back to the agent to prevent request spoofing
      if (
        (frame.type === FrameType.RESPONSE_START ||
          frame.type === FrameType.RESPONSE_DATA ||
          frame.type === FrameType.RESPONSE_END)
      ) {
        socket.write(encodeFrame(frame));
      }

      agentEvents.emit(getEventName(frame.type), getEventPayload(frame));
    }

    const getEventPayload = (frame: Frame) => {
      const base = {
        requestId: frame.requestId,
        tunnelId: tunnelId!,
        timestamp: Date.now(),
      };

      switch (frame.type) {
        case FrameType.REQUEST_START:
          return {
            ...base,
            method: frame.payload.method,
            path: frame.payload.path,
            headers: frame.payload.headers,
            timestamp: Date.now(),
          }
        case FrameType.RESPONSE_START:
          return {
            ...base,
            status: frame.payload.status,
            headers: frame.payload.headers,
            timestamp: Date.now(),
          }
        case FrameType.REQUEST_DATA:
        case FrameType.RESPONSE_DATA:
          return {
            ...base,
            chunk: frame.payload.toString("base64"),
          }
        case FrameType.REQUEST_END:
        case FrameType.RESPONSE_END:
          return {
            ...base,
          }
        default:
          return base;
      }
    };

  };

const sanitizeHeaders = (headers: any, port: string) => {
  const clean: any = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const key = k.toLowerCase();
    if (
      key.startsWith(":") ||
      [
        "connection",
        "upgrade",
        "content-length",
        "accept-encoding",
        "transfer-encoding",
      ].includes(key)
    )
      continue;
    clean[key] = v;
  }
  clean["host"] = `localhost:${port}`;
  return clean;
};

const getEventName = (type: FrameType) => {
  switch (type) {
    case FrameType.REQUEST_START:
      return "request-start";
    case FrameType.REQUEST_DATA:
      return "request-data";
    case FrameType.REQUEST_END:
      return "request-end";
    case FrameType.RESPONSE_START:
      return "response-start";
    case FrameType.RESPONSE_DATA:
      return "response-data";
    case FrameType.RESPONSE_END:
      return "response-end";
    default:
      return "unknown-event";
  }
}

export { upgradeHandler };
