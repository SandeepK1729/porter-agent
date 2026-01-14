import { Command } from "commander";
import http from "http";
import { Buffer } from "node:buffer";

import pkg from "../../package.json";
import client from "@/util/agent";
import {
  decodeFrames,
  decodeTunnelId,
  encodeFrame,
  FrameType,
} from "@/util/buffer";

const jarvis = new Command();

jarvis.name("porter").description(pkg.description).version(pkg.version); // <-- Dynamically injected

// 1. add alias
jarvis
  .command("http")
  .arguments("<local-port>")
  .description("Add http port forwarding")
  .action(async (localPort) => {
    /**
     * Create tunnel
     */
    const agentStream = client.request({
      ":method": "POST",
      ":path": "/agent",
    });

    let buffer = Buffer.alloc(0);
    let requestId: string | null = null;

    agentStream.on("data", (chunk) => {
      if (!requestId) {
        // Extract requestId from the first frame
        requestId = decodeTunnelId(chunk);
        console.log("Tunnel established with ID:", requestId);
        return;
      }

      console.log("Received data from agent");
      const { remaining, frames } = decodeFrames(
        Buffer.concat([buffer, chunk])
      );
      buffer = remaining;

      frames.forEach((frame) => {
        if (frame.type !== FrameType.REQUEST) return;

        const options = {
          method: frame.payload.method,
          path: frame.payload.path,
          headers: frame.payload.headers,
        };
        // Using ANSI escape codes
        console.log(`- \x1b[32m${options.method}\x1b[0m \x1b[34m${options.path}\x1b[0m`);

        const proxy = http.request(
          {
            hostname: "localhost",
            port: parseInt(localPort, 10),
            ...options,
          },
          (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => {
              const obj = {
                type: FrameType.RESPONSE,
                requestId: frame.requestId,
                payload: {
                  status: res.statusCode,
                  headers: res.headers,
                  body,
                },
              };
              const response = encodeFrame(obj);
              agentStream.write(response);
            });
          },
        );

        proxy.on("error", (err) => {
          const obj = {
            type: FrameType.RESPONSE,
            requestId: frame.requestId,
            payload: {
              status: 502,
              headers: {},
              body: "Bad Gateway",
            },
          };
          const response = encodeFrame(obj);
          agentStream.write(response);
        });

        proxy.end();
      });
    });
  });

export default jarvis;
