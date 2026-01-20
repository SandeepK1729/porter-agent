import http from "node:http";
import http2 from "node:http2";
import { Socket } from "node:net";
import { decodeFrames, decodeTunnelId, encodeFrame, FrameType } from "./buffer";
import { caller, publicUrl, REQ_BODY } from "@/config";

const requests = new Map<string, http.ClientRequest>();

// Helper to create a new request to the porter server
// const caller_request = () => 
//   caller.request(REQ_BODY);
const caller_request = () => http2.connect(
  `http://localhost:9000`
  // `http://${REQ_BODY.host}`
);

// Create a single long-lived HTTP/2 session to the server
const createAgentSession = (serverUrl: string, localPort: string) => {
  const req = caller.request(REQ_BODY);
  req.end();

  req.on("upgrade", (res, socket: Socket, head: Buffer) => {
    console.log("🚀 Agent connected");
    const tunnelId = res.headers['x-tunnel-id']?.toString() || "0";
  
    console.log(` ⬇️ Forwarding ${publicUrl.replace("{tunnelId}", tunnelId)} -> http://localhost:${localPort}`);

    
    console.log("Server response headers:", res.headers);
    console.log("Head:", head.toString());

    // Wrap upgraded socket in H2 client
    const session = http2.connect(serverUrl, {
      createConnection: () => socket,
    });

    session.on("stream", handleStream(localPort));

    session.on("error", (err) => {
      console.error("Agent session error:", err);
      session.destroy();
    });

    session.on("close", () => {
      console.log("Agent session closed, reconnecting...");
      // TODO: Reconnect logic
    });

    return session;
  });
  req.on("error", (err) => {
    console.error("Agent request error:", err);
  });
};

// Handle incoming streams from server
const handleStream =
  (localPort: string) =>
    (stream: http2.ServerHttp2Stream, headers: http2.IncomingHttpHeaders) => {
      const proxyReq = http.request(
        {
          host: "localhost",
          port: localPort,
          method: headers[":method"],
          path: headers[":path"],
          headers: sanitizeHeaders(headers, localPort),
        },
        (proxyRes) => {
          stream.respond({
            ":status": proxyRes.statusCode || 500,
            ...proxyRes.headers,
          });
          proxyRes.pipe(stream);
        }
      );

      stream.pipe(proxyReq);

      stream.on("close", () => proxyReq.destroy());
      stream.on("error", (err) => {
        console.error("Stream error:", err.message);
        proxyReq.destroy();
      });

      proxyReq.on("error", (err) => {
        console.error("Proxy request error:", err.message);
        stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
      });
    };

const upgradeHandler =
  (localPort: string) => (stream: http2.ServerHttp2Stream, headers: http2.IncomingHttpHeaders) => {
    const proxyReq = http.request(
      {
        host: "localhost",
        port: localPort,
        method: headers[":method"],
        path: headers[":path"],
        headers: sanitizeHeaders(headers, localPort),
      },
      (proxyRes) => {
        stream.respond({
          ":status": proxyRes.statusCode || 500,
          ...proxyRes.headers,
        });

        proxyRes.pipe(stream);
      }
    );

    stream.pipe(proxyReq);

    stream.on("close", () => proxyReq.destroy());
    stream.on("error", (err) => {
      console.log("Stream error", err);
      proxyReq.destroy();
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

export { caller_request, upgradeHandler, createAgentSession };
