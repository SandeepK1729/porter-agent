import http from "node:http";
import { agentEvents } from "./events";

// ── Server-side request state ─────────────────────────────────────────────────
interface RequestRecord {
  requestId: string;
  method: string;
  path: string;
  reqHeaders: Record<string, unknown>;
  reqBodyChunks: string[]; // base64 encoded chunks
  responseStatus: number | null;
  resHeaders: Record<string, unknown>;
  resBodyChunks: string[]; // base64 encoded chunks
  startTime: number;
  endTime: number | null;
  done: boolean;
}

/** Server-side store – source of truth for rendering HTML fragments. */
const records = new Map<string, RequestRecord>();

// ── SSE clients ───────────────────────────────────────────────────────────────
const clients = new Set<http.ServerResponse>();

/**
 * Write a single SSE message. Multi-line HTML is split into multiple
 * `data:` lines so no double-newline accidentally terminates the frame.
 */
function sseWrite(
  res: http.ServerResponse,
  event: string,
  html: string,
): void {
  const safe = html.trim().replace(/\n{2,}/g, "\n");
  const dataLines = safe
    .split("\n")
    .map((l) => `data: ${l}`)
    .join("\n");
  res.write(`event: ${event}\n${dataLines}\n\n`);
}

/** Broadcast an SSE event carrying HTMX OOB HTML to all connected browsers. */
function broadcastUiUpdate(fragments: string[]): void {
  const html = fragments.join("\n");
  for (const client of clients) {
    sseWrite(client, "ui-update", html);
  }
}

/** Broadcast a per-request `response-end-{id}` event to update any open detail panel. */
function broadcastDetailUpdate(r: RequestRecord): void {
  for (const client of clients) {
    sseWrite(client, `response-end-${r.requestId}`, detailInnerHtml(r));
  }
}

// ── HTML rendering helpers ────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function mthClass(m: string): string {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
    m,
  )
    ? `mth-${m}`
    : "mth-other";
}

function stClass(s: number | null): string {
  if (!s) return "st-p";
  if (s >= 500) return "st-5";
  if (s >= 400) return "st-4";
  if (s >= 300) return "st-3";
  return "st-2";
}

function decodeBodyChunks(chunks: string[]): string {
  if (!chunks.length) return "";
  try {
    return chunks
      .map((c) => Buffer.from(c, "base64").toString("utf8"))
      .join("");
  } catch {
    return chunks.join("");
  }
}

function prettyBody(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function headersHtml(headers: Record<string, unknown>): string {
  const entries = Object.entries(headers ?? {});
  if (!entries.length) {
    return `<span class="no-data">No headers</span>`;
  }
  const rows = entries
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`)
    .join("");
  return `<table class="hdr-tbl"><tbody>${rows}</tbody></table>`;
}

function bodyHtml(chunks: string[]): string {
  const raw = decodeBodyChunks(chunks);
  if (!raw) {
    return `<div class="body-box"><div class="body-none">No body</div></div>`;
  }
  return `<div class="body-box"><pre class="body-pre">${esc(prettyBody(raw))}</pre></div>`;
}

/**
 * A single request row. If `oobSpec` is provided the element gets
 * `hx-swap-oob` so HTMX applies it as an out-of-band DOM patch.
 *
 * Hyperscript `_` attribute handles:
 *  - removing .active from all rows, then adding it to the clicked row
 *  - removing .center from #detail-panel so it switches to content layout
 */
function rowHtml(r: RequestRecord, oobSpec?: string): string {
  const dur = r.endTime ? `${r.endTime - r.startTime}ms` : "&hellip;";
  const stHtml = r.responseStatus
    ? `<div class="st ${stClass(r.responseStatus)}">${r.responseStatus}</div>`
    : `<div class="st st-p">&hellip;</div>`;
  const oob = oobSpec ? ` hx-swap-oob="${esc(oobSpec)}"` : "";
  const cls = `req-row${r.done ? "" : " pending"}`;
  const hs =
    "on click remove .active from .req-row add .active to me remove .center from #detail-panel";
  return (
    `<div id="row-${r.requestId}" class="${cls}"${oob}` +
    ` hx-get="/request/${r.requestId}" hx-target="#detail-panel"` +
    ` hx-swap="innerHTML" hx-trigger="click" _="${hs}">` +
    `<span class="mth ${mthClass(r.method)}">${esc(r.method)}</span>` +
    `<span class="req-path" title="${esc(r.path)}">${esc(r.path)}</span>` +
    `<div class="req-meta">${stHtml}<div class="dur">${dur}</div></div>` +
    `</div>`
  );
}

/** Request count badge, returned as an OOB outerHTML swap. */
function countOobHtml(): string {
  const n = records.size;
  return `<span id="req-count" hx-swap-oob="outerHTML">${n} ${n === 1 ? "request" : "requests"}</span>`;
}

/** Empty-state placeholder for #list-panel. */
const EMPTY_MSG_HTML =
  `<div id="empty-msg" class="empty-list">` +
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">` +
  `<path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>` +
  `</svg><span>Waiting for requests&hellip;</span></div>`;

/** Empty-state for #detail-panel (used by the clear response OOB). */
const EMPTY_DETAIL_HTML =
  `<div id="detail-panel" hx-swap-oob="outerHTML" class="center">` +
  `<div class="ph">` +
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">` +
  `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` +
  `</svg><span>Select a request to view details</span></div></div>`;

/**
 * Inner HTML of the detail panel for request `r`.
 * Served both by `GET /request/:id` and as the payload of
 * `response-end-{id}` SSE events (the `.detail-content` wrapper
 * already has `sse-swap="response-end-{id}"` so HTMX replaces
 * its innerHTML automatically when that event arrives).
 */
function detailInnerHtml(r: RequestRecord): string {
  const dur = r.endTime ? `${r.endTime - r.startTime} ms` : "pending&hellip;";
  const stHtml = r.responseStatus
    ? `<span class="st ${stClass(r.responseStatus)}">${r.responseStatus}</span>`
    : `<span class="st st-p">Pending&hellip;</span>`;

  let html =
    `<div class="summary">` +
    `<span class="mth ${mthClass(r.method)}">${esc(r.method)}</span>` +
    `<span class="s-path">${esc(r.path)}</span>` +
    `${stHtml}<span class="s-dur">${dur}</span>` +
    `</div>` +
    `<div class="section"><div class="section-hdr">Request Headers</div>` +
    `${headersHtml(r.reqHeaders)}</div>` +
    `<div class="section"><div class="section-hdr">Request Body</div>` +
    `${bodyHtml(r.reqBodyChunks)}</div>`;

  if (r.responseStatus !== null) {
    html +=
      `<div class="section"><div class="section-hdr">Response Headers</div>` +
      `${headersHtml(r.resHeaders)}</div>` +
      `<div class="section"><div class="section-hdr">Response Body</div>` +
      `${bodyHtml(r.resBodyChunks)}</div>`;
  }
  return html;
}

/**
 * Full detail panel content for `GET /request/:id`.
 * The `.detail-content` wrapper carries `sse-swap="response-end-{id}"`
 * so HTMX's SSE extension auto-updates the detail panel when the
 * response completes without any client-side JavaScript.
 */
function detailHtml(r: RequestRecord): string {
  return (
    `<div class="detail-content"` +
    ` sse-swap="response-end-${r.requestId}"` +
    ` hx-swap="innerHTML">` +
    detailInnerHtml(r) +
    `</div>`
  );
}

// ── agentEvents → server state + SSE ─────────────────────────────────────────

agentEvents.on(
  "request-start",
  (data: {
    requestId: string;
    method: string;
    path: string;
    headers: Record<string, unknown>;
    timestamp: number;
  }) => {
    records.set(data.requestId, {
      requestId: data.requestId,
      method: data.method,
      path: data.path,
      reqHeaders: data.headers,
      reqBodyChunks: [],
      responseStatus: null,
      resHeaders: {},
      resBodyChunks: [],
      startTime: data.timestamp,
      endTime: null,
      done: false,
    });

    const r = records.get(data.requestId)!;
    const fragments = [
      // Prepend the new row into #list-panel
      rowHtml(r, "afterbegin:#list-panel"),
      // Update the request count badge
      countOobHtml(),
    ];
    // On the very first request hide the "waiting" placeholder
    if (records.size === 1) {
      fragments.push(
        `<div id="empty-msg" hx-swap-oob="outerHTML" style="display:none"></div>`,
      );
    }
    broadcastUiUpdate(fragments);
  },
);

agentEvents.on(
  "request-data",
  (data: { requestId: string; chunk: string }) => {
    records.get(data.requestId)?.reqBodyChunks.push(data.chunk);
  },
);

agentEvents.on("request-end", (_: unknown) => {
  // Nothing to broadcast; detail updates happen on response-end
});

agentEvents.on(
  "response-start",
  (data: {
    requestId: string;
    status: number;
    headers: Record<string, unknown>;
  }) => {
    const r = records.get(data.requestId);
    if (!r) return;
    r.responseStatus = data.status;
    r.resHeaders = data.headers;
    // Patch the row in-place (status badge update)
    broadcastUiUpdate([rowHtml(r, `outerHTML:#row-${r.requestId}`)]);
  },
);

agentEvents.on(
  "response-data",
  (data: { requestId: string; chunk: string }) => {
    records.get(data.requestId)?.resBodyChunks.push(data.chunk);
  },
);

agentEvents.on("response-end", (data: { requestId: string }) => {
  const r = records.get(data.requestId);
  if (!r) return;
  r.done = true;
  r.endTime = Date.now();
  // Patch the row (timing + remove .pending)
  broadcastUiUpdate([rowHtml(r, `outerHTML:#row-${r.requestId}`)]);
  // Push updated detail content to any open detail panel for this request
  broadcastDetailUpdate(r);
});

// ── Embedded HTML dashboard ───────────────────────────────────────────────────
//
// Technology choices:
//   HTMX (htmx.org) – SSE live-swap via hx-ext="sse", REST actions via
//     hx-get / hx-delete, out-of-band (OOB) DOM patches from the server.
//   htmx-ext-sse – official SSE extension for HTMX.
//   Hyperscript (_hyperscript.org) – declarative DOM interactions via `_=`
//     attributes: active-row selection, connection status dot, no JS block.
//
//   All three libraries are loaded from unpkg CDN via <script> tags so the
//   dashboard works without any bundled assets or local file serving.
//
// Key patterns:
//   • <body hx-ext="sse" sse-connect="/events"> – body is the SSE root.
//   • #sse-sink (hidden) absorbs `ui-update` SSE events; OOB fragments in
//     those events patch #list-panel rows, #req-count, #empty-msg in-place.
//   • Each row carries hx-get="/request/{id}" hx-target="#detail-panel"
//     so clicking fetches server-rendered detail HTML.
//   • The .detail-content wrapper returned by GET /request/:id carries
//     sse-swap="response-end-{id}" so HTMX auto-refreshes the detail panel
//     when that per-request SSE event fires – zero client JS needed.
//   • Clear button uses hx-delete="/requests"; the server response carries
//     OOB patches to reset #detail-panel and #req-count.
// ─────────────────────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Porter Agent \u2014 Live Traffic</title>
<script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js"
        integrity="sha384-HGfztofotfshcF7+8n44JQL2oJmowVChPTg48S+jvZoztPfvwD79OC/LTtG6dMp+"
        crossorigin="anonymous"><\/script>
<script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"
        integrity="sha384-fw+eTlCc7suMV/1w/7fr2/PmwElUIt5i82bi+qTiLXvjRXZ2/FkiTNA/w0MhXnGI"
        crossorigin="anonymous"><\/script>
<script src="https://unpkg.com/hyperscript.org@0.9.13/dist/_hyperscript.min.js"
        integrity="sha384-5yQ5JTatiFEgeiEB4mfkRI3oTGtaNpbJGdcciZ4IEYFpLGt8yDsGAd7tKiMwnX9b"
        crossorigin="anonymous"><\/script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{background:#1e293b;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #334155;flex-shrink:0}
.logo{font-size:1.1rem;font-weight:700;color:#38bdf8;letter-spacing:-0.3px}
.conn-status{display:flex;align-items:center;gap:8px;font-size:0.8125rem;color:#94a3b8}
.dot{width:8px;height:8px;border-radius:50%;background:#22c55e}
.dot.off{background:#ef4444}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.4}}
.dot.live{animation:blink 1.8s ease-in-out infinite}
.toolbar{background:#1e293b;padding:6px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #334155;flex-shrink:0}
.btn{padding:5px 12px;border-radius:5px;border:1px solid #475569;background:transparent;color:#94a3b8;cursor:pointer;font-size:0.8rem;transition:all .15s}
.btn:hover{background:#334155;color:#e2e8f0}
#req-count{margin-left:auto;font-size:0.8rem;color:#475569}
main{display:flex;flex:1;overflow:hidden}
#list-panel{width:360px;min-width:240px;overflow-y:auto;border-right:1px solid #334155;flex-shrink:0}
.empty-list{display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:10px;color:#475569;font-size:0.875rem;padding:20px;text-align:center}
.req-row{padding:8px 14px;border-bottom:1px solid #1e293b;cursor:pointer;display:grid;grid-template-columns:52px 1fr auto;gap:8px;align-items:center;transition:background .1s}
.req-row:hover{background:#1a2744}
.req-row.active{background:#1e3a5f;border-left:3px solid #38bdf8;padding-left:11px}
.req-row.pending{opacity:.75}
.mth{font-size:.65rem;font-weight:800;padding:2px 5px;border-radius:4px;text-align:center;letter-spacing:.4px;white-space:nowrap}
.mth-GET{background:#0c4a6e;color:#38bdf8}
.mth-POST{background:#14532d;color:#4ade80}
.mth-PUT{background:#78350f;color:#fbbf24}
.mth-PATCH{background:#4c1d95;color:#a78bfa}
.mth-DELETE{background:#7f1d1d;color:#f87171}
.mth-HEAD,.mth-OPTIONS{background:#1e3a5f;color:#93c5fd}
.mth-other{background:#1e293b;color:#94a3b8}
.req-path{font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1}
.req-meta{text-align:right;white-space:nowrap}
.st{font-size:.75rem;font-weight:600}
.st-2{color:#4ade80}.st-3{color:#60a5fa}.st-4{color:#fbbf24}.st-5{color:#f87171}.st-p{color:#64748b}
.dur{font-size:.7rem;color:#475569;margin-top:2px}
#detail-panel{flex:1;overflow-y:auto;padding:16px 20px}
#detail-panel.center{display:flex;align-items:center;justify-content:center}
.ph{display:flex;flex-direction:column;align-items:center;gap:10px;color:#475569;font-size:.9rem}
.summary{display:flex;align-items:center;gap:10px;background:#1e293b;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:.875rem;flex-wrap:wrap}
.summary .s-path{color:#94a3b8;flex:1;word-break:break-all;font-family:monospace;font-size:.8rem}
.summary .s-dur{font-size:.75rem;color:#64748b}
.section{margin-bottom:18px}
.section-hdr{font-size:.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.section-hdr::after{content:"";flex:1;height:1px;background:#334155}
.hdr-tbl{width:100%;border-collapse:collapse;font-size:.78rem}
.hdr-tbl tr:nth-child(odd) td{background:#111827}
.hdr-tbl td{padding:4px 8px;vertical-align:top;word-break:break-word}
.hdr-tbl td:first-child{color:#7dd3fc;font-family:monospace;white-space:nowrap;width:36%;padding-right:12px}
.hdr-tbl td:last-child{color:#e2e8f0;font-family:monospace}
.body-box{background:#111827;border:1px solid #334155;border-radius:6px}
.body-pre{padding:10px 12px;font-family:'Cascadia Code',Consolas,monospace;font-size:.78rem;line-height:1.65;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow-y:auto;color:#e2e8f0}
.body-none{padding:10px 12px;color:#475569;font-style:italic;font-size:.8rem}
.no-data{color:#475569;font-size:.8rem;font-style:italic}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:#0f172a}
::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#475569}
</style>
</head>
<!--
  hx-ext="sse"        – enable the HTMX SSE extension on the whole page
  sse-connect="/events" – open an EventSource to our /events endpoint
  _="..."             – Hyperscript: update the connection-status dot/label
                        when HTMX fires htmx:sseOpen / htmx:sseError on body
-->
<body hx-ext="sse" sse-connect="/events"
  _="on htmx:sseOpen
       remove .off from #dot
       add .live to #dot
       set the textContent of #conn-label to 'Connected'
     on htmx:sseError
       remove .live from #dot
       add .off to #dot
       set the textContent of #conn-label to 'Disconnected \u2014 retrying\u2026'">

<header>
  <div class="logo">&#9889; Porter Agent &mdash; Live Traffic</div>
  <div class="conn-status">
    <div class="dot off" id="dot"></div>
    <span id="conn-label">Connecting&hellip;</span>
  </div>
</header>

<div class="toolbar">
  <!--
    hx-delete="/requests" – DELETE /requests clears server state
    hx-target / hx-swap   – main response goes into #list-panel innerHTML
    The server response also carries OOB patches for #detail-panel and
    #req-count so everything resets in one round-trip, no JS needed.
  -->
  <button class="btn"
          hx-delete="/requests"
          hx-target="#list-panel"
          hx-swap="innerHTML">Clear</button>
  <span id="req-count">0 requests</span>
</div>

<main>
  <div id="list-panel">
    <div class="empty-list" id="empty-msg">
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
      <span>Waiting for requests&hellip;</span>
    </div>
  </div>
  <div id="detail-panel" class="center">
    <div class="ph">
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      <span>Select a request to view details</span>
    </div>
  </div>
</main>

<!--
  Hidden SSE sink: absorbs "ui-update" events from the server.
  Each "ui-update" message body carries one or more hx-swap-oob fragments
  that HTMX applies directly to matching elements in the DOM
  (new rows, count badge, row status patches, etc.).
-->
<div id="sse-sink" sse-swap="ui-update" hx-swap="innerHTML" style="display:none"></div>

</body>
</html>`;

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
        if (records.size > 0) {
          const rows = Array.from(records.values())
            .reverse()
            .map((r) => rowHtml(r))
            .join("\n");
          sseWrite(res, "ui-update", [
            `<div id="list-panel" hx-swap-oob="innerHTML">${rows}</div>`,
            countOobHtml(),
            `<div id="empty-msg" hx-swap-oob="outerHTML" style="display:none"></div>`,
          ].join("\n"));
        }

        clients.add(res);
        req.on("close", () => clients.delete(res));
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
      res.end(HTML);
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
