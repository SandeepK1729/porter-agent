import http from "node:http";
import { Socket } from "node:net";
import { decodeFrames, decodeTunnelId, encodeFrame, FrameType } from "./buffer";
import { publicUrl } from "@/config";

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

          const proxy = http.request(options, (res) => {
            // send response start
            socket.write(
              encodeFrame({
                type: FrameType.RESPONSE_START as const,
                requestId: frame.requestId,
                payload: {
                  status: res.statusCode || 500,
                  headers: res.headers,
                },
              }),
            );

            // pipe response data
            res.on("data", (c) =>
              socket.write(
                encodeFrame({
                  type: FrameType.RESPONSE_DATA as const,
                  requestId: frame.requestId,
                  payload: c,
                }),
              ),
            );

            // response end
            res.on("end", () => {
              socket.write(
                encodeFrame({
                  type: FrameType.RESPONSE_END as const,
                  requestId: frame.requestId,
                }),
              );
            });
          });

          proxy.on("error", (err) => {
            socket.write(
              encodeFrame({
                type: FrameType.RESPONSE_START as const,
                requestId: frame.requestId,
                payload: {
                  status: 502,
                  headers: {},
                  body: "Bad Gateway: " + err.message,
                },
              }),
            );

            socket.write(
              encodeFrame({
                type: FrameType.RESPONSE_END as const,
                requestId: frame.requestId,
              }),
            );
          });

          requests.set(frame.requestId, proxy);
        } else if (frame.type === FrameType.REQUEST_DATA) {
          requests.get(frame.requestId)?.write(frame.payload);
        } else if (frame.type === FrameType.REQUEST_END) {
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

export { upgradeHandler };
