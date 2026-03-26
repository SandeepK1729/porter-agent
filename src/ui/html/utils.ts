// ── HTML rendering helpers ────────────────────────────────────────────────────

const esc = (s: unknown): string => {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const mthClass = (m: string): string => {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
    m,
  )
    ? `mth-${m}`
    : "mth-other";
}

const stClass = (s: number | null): string => {
  if (!s) return "st-p";
  if (s >= 500) return "st-5";
  if (s >= 400) return "st-4";
  if (s >= 300) return "st-3";
  return "st-2";
}

const decodeBodyChunks = (chunks: string[]): string => {
  if (!chunks.length) return "";
  try {
    return chunks
      .map((c) => Buffer.from(c, "base64").toString("utf8"))
      .join("");
  } catch {
    return chunks.join("");
  }
}

const prettyBody = (raw: string): string => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const headersHtml = (headers: Record<string, unknown>): string => {
  const entries = Object.entries(headers ?? {});
  if (!entries.length) {
    return `<span class="no-data">No headers</span>`;
  }
  const rows = entries
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`)
    .join("");
  return `<table class="hdr-tbl"><tbody>${rows}</tbody></table>`;
}

const bodyHtml = (chunks: string[]): string => {
  const raw = decodeBodyChunks(chunks);
  if (!raw) {
    return `<div class="body-box"><div class="body-none">No body</div></div>`;
  }
  return `<div class="body-box"><pre class="body-pre">${esc(prettyBody(raw))}</pre></div>`;
}

export { esc, mthClass, stClass, decodeBodyChunks, headersHtml, bodyHtml };
