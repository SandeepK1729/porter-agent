import http from "node:http";
import { agentEvents } from "./events";
import Storage from './storage';
import { RequestRecord } from "./types";
import Channel, { ChannelEvent } from "./channel";
import { EventType } from "@/util/buffer";
import { countOobHtml, detailHtml, EMPTY_DETAIL_HTML, EMPTY_MSG_HTML, INDEX_HTML, rowHtml } from "./html";

const channel = new Channel();
const records = new Storage<RequestRecord>();

const processEvent = (event: EventType, data: any) => {

  const channelEvents: { event: ChannelEvent; fragments: string[] }[] = [];

  switch (event) {
    case "request-start": {
      const record = new RequestRecord(data);
      records.set(record.requestId, record);

      channelEvents.push({
        event: "ui-update",
        fragments: [
          // Prepend the new row into #list-panel
          rowHtml(record, "afterbegin:#list-panel"),
          // Update the request count badge
          countOobHtml(records.size()),
        ],
      });

      // On the very first request hide the "waiting" placeholder
      if (records.size() === 1) {
        channelEvents.push({
          event: "ui-update",
          fragments: [
            `<div id="empty-msg" hx-swap-oob="outerHTML" style="display:none"></div>`,
          ],
        });
      }
      break;
    }

    case "request-data": {
      records.get(data.requestId)?.addRequestBody(data);
      break;
    }

    case "request-end": {
      // Nothing to broadcast; detail updates happen on response-end
      break;
    }

    case "response-start": {
      const r = records.get(data.requestId);
      if (!r) break;

      r.setResponseStart(data);

      // Patch the row in-place (status badge update)
      channelEvents.push({
        event: "ui-update",
        fragments: [rowHtml(r, `outerHTML:#row-${r.requestId}`)],
      });
      break;
    }

    case "response-data": {
      records.get(data.requestId)?.addResponseBody(data);
      break;
    }

    case "response-end": {
      const r = records.get(data.requestId);
      if (!r) break;

      r.setResponseEnd(data);

      // Patch the row (timing + remove .pending)
      channelEvents.push({
        event: "ui-update",
        fragments: [rowHtml(r, `outerHTML:#row-${r.requestId}`)],
      });

      // Push updated detail content to any open detail panel for this request
      channelEvents.push({
        event: `response-end-${r.requestId}`,
        fragments: [detailHtml(r)],
      });
      break;
    }
  }

  channelEvents.forEach(({ event, fragments }) => {
    channel.broadcast(event, fragments);
  });
}

Object.values(EventType).forEach((event) => {
  agentEvents.on(event, (data) => processEvent(event, data));
});

// ── HTTP server ───────────────────────────────────────────────────────────────

function startUIServer(port = 7676): http.Server {
  const server = http.createServer(
    (req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = req.url ?? "/";

      // ── GET /events  (SSE stream) ─────────────────────────────────────────
      if (url === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        res.write(": connected\n\n");

        // Replay current state so late-joining browsers see existing traffic
        if (records.hasData()) {
          const rows = records.getValues()
            .reverse()
            .map((r) => rowHtml(r))
            .join("\n");

          channel.send(res, "ui-update", [
            `<div id="list-panel" hx-swap-oob="innerHTML">${rows}</div>`,
            countOobHtml(records.size()),
            `<div id="empty-msg" hx-swap-oob="outerHTML" style="display:none"></div>`,
          ].join("\n"));
        }

        channel.subscribe(res);
        req.on("close", () => channel.unsubscribe(res));
        return;
      }

      // ── GET /request/:id  (detail panel fragment) ─────────────────────────
      const detailMatch = url.match(/^\/request\/([a-f0-9]+)$/);
      if (req.method === "GET" && detailMatch) {
        const r = records.get(detailMatch[1] ?? "");
        if (!r) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(detailHtml(r));
        return;
      }

      // ── DELETE /requests  (clear all) ────────────────────────────────────
      if (req.method === "DELETE" && url === "/requests") {
        records.clear();
        // Main response → replaces #list-panel innerHTML (hx-target on button)
        // OOB responses → reset #detail-panel and #req-count in the same trip
        const body =
          EMPTY_MSG_HTML +
          EMPTY_DETAIL_HTML +
          `<span id="req-count" hx-swap-oob="outerHTML">0 requests</span>`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(body);
        return;
      }

      // ── GET /  (main page) ────────────────────────────────────────────────
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(INDEX_HTML);
    },
  );

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `⚠️  Web UI port ${port} is already in use. UI will not be available.`,
      );
    } else {
      console.error("Web UI server error:", err.message);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`\uD83C\uDF10 Web UI available at http://localhost:${port}`);
  });

  return server;
}

export { startUIServer };
