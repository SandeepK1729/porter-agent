import http from "node:http";
import { agentEvents } from "./events";

const clients = new Set<http.ServerResponse>();

/** Replay buffer: stores the last MAX_HISTORY events for late-joining SSE clients.
 *  Also capped at MAX_HISTORY_BYTES total serialised size to bound memory usage. */
const MAX_HISTORY = 500;
const MAX_HISTORY_BYTES = 5 * 1024 * 1024; // 5 MB
const eventHistory: Array<{ event: string; data: unknown; size: number }> = [];
let historyBytes = 0;

function record(event: string, data: unknown): void {
  const size = JSON.stringify(data).length;
  eventHistory.push({ event, data, size });
  historyBytes += size;

  // Evict oldest entries when either limit is exceeded
  while (
    eventHistory.length > MAX_HISTORY ||
    historyBytes > MAX_HISTORY_BYTES
  ) {
    const removed = eventHistory.shift();
    if (removed) historyBytes -= removed.size;
  }
}

function broadcast(event: string, data: unknown): void {
  record(event, data);
  const msg = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
  for (const client of clients) {
    client.write(msg);
  }
}

agentEvents.on("request-start", (data: unknown) =>
  broadcast("request-start", data),
);
agentEvents.on("request-data", (data: unknown) =>
  broadcast("request-data", data),
);
agentEvents.on("request-end", (data: unknown) =>
  broadcast("request-end", data),
);
agentEvents.on("response-start", (data: unknown) =>
  broadcast("response-start", data),
);
agentEvents.on("response-data", (data: unknown) =>
  broadcast("response-data", data),
);
agentEvents.on("response-end", (data: unknown) =>
  broadcast("response-end", data),
);

/* ------------------------------------------------------------------ */
/*  Embedded HTML dashboard (no external files needed after bundling)  */
/* ------------------------------------------------------------------ */
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Porter Agent \u2014 Live Traffic</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;height:100vh;display:flex;flex-direction:column;overflow:hidden}
/* Header */
header{background:#1e293b;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #334155;flex-shrink:0}
.logo{font-size:1.1rem;font-weight:700;color:#38bdf8;letter-spacing:-0.3px}
.conn-status{display:flex;align-items:center;gap:8px;font-size:0.8125rem;color:#94a3b8}
.dot{width:8px;height:8px;border-radius:50%;background:#22c55e}
.dot.off{background:#ef4444}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.4}}
.dot.live{animation:blink 1.8s ease-in-out infinite}
/* Toolbar */
.toolbar{background:#1e293b;padding:6px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #334155;flex-shrink:0}
.btn{padding:5px 12px;border-radius:5px;border:1px solid #475569;background:transparent;color:#94a3b8;cursor:pointer;font-size:0.8rem;transition:all .15s}
.btn:hover{background:#334155;color:#e2e8f0}
.req-count{margin-left:auto;font-size:0.8rem;color:#475569}
/* Layout */
main{display:flex;flex:1;overflow:hidden}
/* Left panel */
#list-panel{width:360px;min-width:240px;overflow-y:auto;border-right:1px solid #334155;flex-shrink:0}
.empty-list{display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:10px;color:#475569;font-size:0.875rem;padding:20px;text-align:center}
/* Request row */
.req-row{padding:8px 14px;border-bottom:1px solid #1e293b;cursor:pointer;display:grid;grid-template-columns:52px 1fr auto;gap:8px;align-items:center;transition:background .1s}
.req-row:hover{background:#1a2744}
.req-row.active{background:#1e3a5f;border-left:3px solid #38bdf8;padding-left:11px}
.req-row.pending{opacity:.75}
/* Method badge */
.mth{font-size:.65rem;font-weight:800;padding:2px 5px;border-radius:4px;text-align:center;letter-spacing:.4px;white-space:nowrap}
.mth-GET{background:#0c4a6e;color:#38bdf8}
.mth-POST{background:#14532d;color:#4ade80}
.mth-PUT{background:#78350f;color:#fbbf24}
.mth-PATCH{background:#4c1d95;color:#a78bfa}
.mth-DELETE{background:#7f1d1d;color:#f87171}
.mth-HEAD,.mth-OPTIONS{background:#1e3a5f;color:#93c5fd}
.mth-other{background:#1e293b;color:#94a3b8}
/* Path + meta */
.req-path{font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1}
.req-meta{text-align:right;white-space:nowrap}
.st{font-size:.75rem;font-weight:600}
.st-2{color:#4ade80}.st-3{color:#60a5fa}.st-4{color:#fbbf24}.st-5{color:#f87171}.st-p{color:#64748b}
.dur{font-size:.7rem;color:#475569;margin-top:2px}
/* Right detail panel */
#detail-panel{flex:1;overflow-y:auto;padding:16px 20px}
#detail-panel.center{display:flex;align-items:center;justify-content:center}
.ph{display:flex;flex-direction:column;align-items:center;gap:10px;color:#475569;font-size:.9rem}
/* Summary bar */
.summary{display:flex;align-items:center;gap:10px;background:#1e293b;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:.875rem;flex-wrap:wrap}
.summary .s-path{color:#94a3b8;flex:1;word-break:break-all;font-family:monospace;font-size:.8rem}
.summary .s-st{font-weight:700;font-size:.9rem}
.summary .s-dur{font-size:.75rem;color:#64748b}
/* Section */
.section{margin-bottom:18px}
.section-hdr{font-size:.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.section-hdr::after{content:"";flex:1;height:1px;background:#334155}
/* Headers table */
.hdr-tbl{width:100%;border-collapse:collapse;font-size:.78rem}
.hdr-tbl tr:nth-child(odd) td{background:#111827}
.hdr-tbl td{padding:4px 8px;vertical-align:top;word-break:break-word}
.hdr-tbl td:first-child{color:#7dd3fc;font-family:monospace;white-space:nowrap;width:36%;padding-right:12px}
.hdr-tbl td:last-child{color:#e2e8f0;font-family:monospace}
/* Body */
.body-box{background:#111827;border:1px solid #334155;border-radius:6px}
.body-pre{padding:10px 12px;font-family:'Cascadia Code',Consolas,monospace;font-size:.78rem;line-height:1.65;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow-y:auto;color:#e2e8f0}
.body-none{padding:10px 12px;color:#475569;font-style:italic;font-size:.8rem}
/* Scrollbar */
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:#0f172a}
::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#475569}
</style>
</head>
<body>
<header>
  <div class="logo">&#9889; Porter Agent &mdash; Live Traffic</div>
  <div class="conn-status">
    <div class="dot off" id="dot"></div>
    <span id="conn-label">Connecting&hellip;</span>
  </div>
</header>
<div class="toolbar">
  <button class="btn" id="clear-btn">Clear</button>
  <span class="req-count" id="req-count">0 requests</span>
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
<script>
(function() {
  var state = { reqs: new Map(), sel: null };

  /* ---- helpers ---- */
  function esc(s) {
    return String(s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;");
  }
  function mthClass(m) {
    var known = ["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"];
    return known.indexOf(m) >= 0 ? "mth-" + m : "mth-other";
  }
  function stClass(s) {
    if (!s) return "st-p";
    if (s >= 500) return "st-5";
    if (s >= 400) return "st-4";
    if (s >= 300) return "st-3";
    return "st-2";
  }
  function decodeBody(chunks) {
    if (!chunks || chunks.length === 0) return "";
    try { return chunks.map(function(c) { return atob(c); }).join(""); }
    catch(e) { return chunks.join(""); }
  }
  function prettyBody(raw) {
    if (!raw) return null;
    try { return JSON.stringify(JSON.parse(raw), null, 2); }
    catch(e) { return raw; }
  }
  function renderHeaders(hdrs) {
    var entries = Object.entries(hdrs || {});
    if (!entries.length) return "<span style='color:#475569;font-size:.8rem;font-style:italic'>No headers</span>";
    var rows = entries.map(function(e) {
      return "<tr><td>" + esc(e[0]) + "</td><td>" + esc(String(e[1])) + "</td></tr>";
    }).join("");
    return "<table class='hdr-tbl'><tbody>" + rows + "</tbody></table>";
  }
  function renderBody(chunks) {
    var raw = decodeBody(chunks);
    if (!raw) return "<div class='body-box'><div class='body-none'>No body</div></div>";
    var display = prettyBody(raw) || raw;
    return "<div class='body-box'><pre class='body-pre'>" + esc(display) + "</pre></div>";
  }

  /* ---- list ---- */
  function renderList() {
    var panel = document.getElementById("list-panel");
    var countEl = document.getElementById("req-count");
    var n = state.reqs.size;
    countEl.textContent = n + (n === 1 ? " request" : " requests");
    if (n === 0) {
      panel.innerHTML = "";
      var empty = document.getElementById("empty-msg") || document.createElement("div");
      empty.id = "empty-msg";
      empty.className = "empty-list";
      empty.innerHTML = "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='1.5'><path stroke-linecap='round' stroke-linejoin='round' d='M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'/></svg><span>Waiting for requests&hellip;</span>";
      panel.appendChild(empty);
      return;
    }
    var html = "";
    var ids = Array.from(state.reqs.keys()).reverse();
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var r = state.reqs.get(id);
      var active = id === state.sel ? " active" : "";
      var pending = r.done ? "" : " pending";
      var dur = r.endTime ? (r.endTime - r.startTime) + "ms" : "&hellip;";
      html += "<div class='req-row" + active + pending + "' data-id='" + id + "'>";
      html += "<span class='mth " + mthClass(r.method) + "'>" + esc(r.method) + "</span>";
      html += "<span class='req-path' title='" + esc(r.path) + "'>" + esc(r.path) + "</span>";
      html += "<div class='req-meta'>";
      html += "<div class='st " + stClass(r.responseStatus) + "'>" + (r.responseStatus || "&hellip;") + "</div>";
      html += "<div class='dur'>" + dur + "</div>";
      html += "</div></div>";
    }
    panel.innerHTML = html;
    panel.querySelectorAll(".req-row").forEach(function(el) {
      el.addEventListener("click", function() { selectReq(el.dataset.id); });
    });
  }

  /* ---- detail ---- */
  function renderDetail(id) {
    var panel = document.getElementById("detail-panel");
    var r = id ? state.reqs.get(id) : null;
    if (!r) {
      panel.className = "center";
      panel.innerHTML = "<div class='ph'><svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='1.5'><path stroke-linecap='round' stroke-linejoin='round' d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'/></svg><span>Select a request to view details</span></div>";
      return;
    }
    panel.className = "";
    var dur = r.endTime ? (r.endTime - r.startTime) + " ms" : "pending&hellip;";
    var sc = stClass(r.responseStatus);
    var stStr = r.responseStatus ? ("<span class='st " + sc + "'>" + r.responseStatus + "</span>") : "<span class='st st-p'>Pending&hellip;</span>";
    var html = "<div class='summary'>";
    html += "<span class='mth " + mthClass(r.method) + "'>" + esc(r.method) + "</span>";
    html += "<span class='s-path'>" + esc(r.path) + "</span>";
    html += stStr;
    html += "<span class='s-dur'>" + dur + "</span>";
    html += "</div>";
    html += "<div class='section'><div class='section-hdr'>Request Headers</div>" + renderHeaders(r.reqHeaders) + "</div>";
    html += "<div class='section'><div class='section-hdr'>Request Body</div>" + renderBody(r.reqBody) + "</div>";
    if (r.responseStatus !== null) {
      html += "<div class='section'><div class='section-hdr'>Response Headers</div>" + renderHeaders(r.resHeaders) + "</div>";
      html += "<div class='section'><div class='section-hdr'>Response Body</div>" + renderBody(r.resBody) + "</div>";
    }
    panel.innerHTML = html;
  }

  function selectReq(id) {
    state.sel = id;
    renderList();
    renderDetail(id);
  }

  /* ---- SSE ---- */
  function connect() {
    var src = new EventSource("/events");
    var dot = document.getElementById("dot");
    var label = document.getElementById("conn-label");

    src.onopen = function() {
      dot.className = "dot live";
      label.textContent = "Connected";
    };
    src.onerror = function() {
      dot.className = "dot off";
      label.textContent = "Disconnected \u2014 retrying\u2026";
    };

    src.addEventListener("request-start", function(e) {
      var d = JSON.parse(e.data);
      state.reqs.set(d.requestId, {
        method: d.method, path: d.path,
        reqHeaders: d.headers, reqBody: [],
        responseStatus: null, resHeaders: {}, resBody: [],
        done: false, startTime: d.timestamp, endTime: null
      });
      renderList();
      if (!state.sel) selectReq(d.requestId);
    });

    src.addEventListener("request-data", function(e) {
      var d = JSON.parse(e.data);
      var r = state.reqs.get(d.requestId);
      if (r) r.reqBody.push(d.chunk);
    });

    src.addEventListener("response-start", function(e) {
      var d = JSON.parse(e.data);
      var r = state.reqs.get(d.requestId);
      if (r) {
        r.responseStatus = d.status;
        r.resHeaders = d.headers;
        renderList();
        if (state.sel === d.requestId) renderDetail(d.requestId);
      }
    });

    src.addEventListener("response-data", function(e) {
      var d = JSON.parse(e.data);
      var r = state.reqs.get(d.requestId);
      if (r) r.resBody.push(d.chunk);
    });

    src.addEventListener("response-end", function(e) {
      var d = JSON.parse(e.data);
      var r = state.reqs.get(d.requestId);
      if (r) {
        r.done = true;
        r.endTime = Date.now();
        renderList();
        if (state.sel === d.requestId) renderDetail(d.requestId);
      }
    });
  }

  document.getElementById("clear-btn").addEventListener("click", function() {
    state.reqs.clear();
    state.sel = null;
    renderList();
    renderDetail(null);
  });

  connect();
})();
</script>
</body>
</html>`;

function startUIServer(port = 7676): http.Server {
  const server = http.createServer(
    (req: http.IncomingMessage, res: http.ServerResponse) => {
      if (req.url === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        res.write(": connected\n\n");
        // Replay buffered history so late-joining clients see past traffic
        for (const item of eventHistory) {
          res.write(
            "event: " + item.event + "\ndata: " + JSON.stringify(item.data) + "\n\n",
          );
        }
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
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
