import http from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startUIServer } from "./server";
import { agentEvents } from "./events";

// Pick a dedicated port that won't collide with the app default (7676)
const TEST_PORT = 17676;

let server: http.Server;

/** Promisified HTTP helper */
function httpRequest(
  method: string,
  path: string,
  port = TEST_PORT,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = startUIServer(TEST_PORT);
      server.once("listening", resolve);
    }),
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

describe("GET /  (dashboard page)", () => {
  it("returns HTTP 200", async () => {
    const { status } = await httpRequest("GET", "/");
    expect(status).toBe(200);
  });

  it("sets Content-Type to text/html", async () => {
    const { headers } = await httpRequest("GET", "/");
    expect(headers["content-type"]).toContain("text/html");
  });

  it("serves the Porter Agent dashboard HTML", async () => {
    const { body } = await httpRequest("GET", "/");
    expect(body).toContain("Porter Agent");
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("includes the HTMX SSE connection attribute", async () => {
    const { body } = await httpRequest("GET", "/");
    expect(body).toContain("sse-connect");
  });
});

describe("GET /events  (SSE stream)", () => {
  it("returns HTTP 200 with SSE content-type", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: TEST_PORT,
          method: "GET",
          path: "/events",
        },
        (res) => {
          try {
            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toContain("text/event-stream");
          } catch (e) {
            reject(e);
          } finally {
            req.destroy();
            resolve();
          }
        },
      );
      req.on("error", (e) => {
        // Ignore "socket hang up" triggered by req.destroy()
        if ((e as NodeJS.ErrnoException).code !== "ECONNRESET") reject(e);
      });
      req.end();
    });
  });
});

describe("GET /request/:id  (detail fragment)", () => {
  it("returns 404 for an unknown request ID", async () => {
    const { status } = await httpRequest("GET", "/request/deadbeef00000000");
    expect(status).toBe(404);
  });

  it("returns 200 and HTML when a record exists (after request-start event)", async () => {
    const requestId = "aabb1122aabb1122";

    // Emit a request-start event so the server registers the record
    agentEvents.emit("request-start", {
      type: 1,
      requestId,
      payload: { method: "GET", path: "/smoke", headers: { host: "localhost" } },
      timestamp: Date.now(),
    });

    const { status, headers, body } = await httpRequest(
      "GET",
      `/request/${requestId}`,
    );
    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("text/html");
    expect(body).toContain("/smoke");
  });
});

describe("DELETE /requests  (clear all records)", () => {
  it("returns HTTP 200", async () => {
    const { status } = await httpRequest("DELETE", "/requests");
    expect(status).toBe(200);
  });

  it("returns HTML that resets the list panel", async () => {
    const { body } = await httpRequest("DELETE", "/requests");
    // The response includes the empty-msg placeholder and detail-panel reset
    expect(body).toContain("empty-msg");
    expect(body).toContain("detail-panel");
  });

  it("clears records so that a previously existing request returns 404", async () => {
    // Add a record
    const requestId = "ccdd1234ccdd1234";
    agentEvents.emit("request-start", {
      type: 1,
      requestId,
      payload: { method: "POST", path: "/to-be-cleared", headers: {} },
      timestamp: Date.now(),
    });

    // Verify it exists
    const before = await httpRequest("GET", `/request/${requestId}`);
    expect(before.status).toBe(200);

    // Clear all
    await httpRequest("DELETE", "/requests");

    // Now it should be gone
    const after = await httpRequest("GET", `/request/${requestId}`);
    expect(after.status).toBe(404);
  });
});
