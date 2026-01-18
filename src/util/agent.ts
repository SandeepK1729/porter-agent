import http from "node:http";
import { Socket } from "node:net";
import { decodeFrames, decodeTunnelId, encodeFrame, FrameType } from "./buffer";
import { publicUrl } from "@/config";

const upgradeHandler = (localPort: string) => (res: http.IncomingMessage, socket: Socket) => {
  let tunnelId: string | null = null;
  let buffer = Buffer.alloc(0);

  console.log("🚀 Agent connected");

  socket.on("data", (chunk) => {

    if (!tunnelId) {
      tunnelId = decodeTunnelId(Buffer.concat([buffer, chunk]));
      console.log(`⬇️ Forwarding ${publicUrl.replace("{tunnelId}", tunnelId)} -> http://localhost:${localPort}`);
      buffer = Buffer.alloc(0);
      return;
    }

    const { frames, remaining } = decodeFrames(Buffer.concat([buffer, chunk]));
    buffer = remaining;

    frames.forEach((frame) => {
      if (frame.type !== FrameType.REQUEST) return;

      const options = {
        host: "localhost",
        port: parseInt(localPort, 10),
        method: frame.payload.method,
        path: frame.payload.path,
        headers: frame.payload.headers,
      };

      console.log(`➡️  Incoming request for tunnel ${tunnelId}: `, options);
      // Using ANSI escape codes
      console.log(
        `- \x1b[32m${options.method}\x1b[0m \x1b[34m${options.path}\x1b[0m`,
      );

      const proxy = http.request(
        options,
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => socket.write(
            encodeFrame({
              type: FrameType.RESPONSE as const,
              requestId: frame.requestId,
              payload: {
                status: res.statusCode,
                headers: res.headers,
                body,
              },
            })));
        },
      );

      proxy.on("error", (err) =>
        socket.write(
          encodeFrame(
            {
              type: FrameType.RESPONSE as const,
              requestId: frame.requestId,
              payload: {
                status: 502,
                headers: {},
                body: "Bad Gateway: " + err.message
              },
            })
        ));

      proxy.end();
    });
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err);
  });

  socket.on("close", () => {
    console.log("Agent disconnected");
  });
};

export { upgradeHandler };
