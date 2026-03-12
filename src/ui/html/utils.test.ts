import { describe, it, expect } from "vitest";
import { esc, mthClass, stClass, headersHtml, bodyHtml } from "./utils";

describe("esc", () => {
  it("escapes ampersands", () => {
    expect(esc("a & b")).toBe("a &amp; b");
  });

  it("escapes less-than and greater-than", () => {
    expect(esc("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes double quotes", () => {
    expect(esc('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(esc("it's")).toBe("it&#x27;s");
  });

  it("passes plain text through unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
  });

  it("converts non-string values to string", () => {
    expect(esc(42)).toBe("42");
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

describe("mthClass", () => {
  it.each(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])(
    "returns mth-%s for %s",
    (method) => {
      expect(mthClass(method)).toBe(`mth-${method}`);
    },
  );

  it("returns mth-other for unknown methods", () => {
    expect(mthClass("CONNECT")).toBe("mth-other");
    expect(mthClass("")).toBe("mth-other");
  });
});

describe("stClass", () => {
  it("returns st-p for null (pending)", () => {
    expect(stClass(null)).toBe("st-p");
  });

  it("returns st-2 for 2xx responses", () => {
    expect(stClass(200)).toBe("st-2");
    expect(stClass(201)).toBe("st-2");
  });

  it("returns st-3 for 3xx responses", () => {
    expect(stClass(301)).toBe("st-3");
    expect(stClass(302)).toBe("st-3");
  });

  it("returns st-4 for 4xx responses", () => {
    expect(stClass(400)).toBe("st-4");
    expect(stClass(404)).toBe("st-4");
  });

  it("returns st-5 for 5xx responses", () => {
    expect(stClass(500)).toBe("st-5");
    expect(stClass(503)).toBe("st-5");
  });
});

describe("headersHtml", () => {
  it("returns a no-data span when headers are empty", () => {
    expect(headersHtml({})).toContain("no-data");
  });

  it("renders header key/value pairs in a table", () => {
    const html = headersHtml({ "content-type": "application/json" });
    expect(html).toContain("hdr-tbl");
    expect(html).toContain("content-type");
    expect(html).toContain("application/json");
  });

  it("escapes special characters in header values", () => {
    const html = headersHtml({ "x-custom": "<danger>" });
    expect(html).not.toContain("<danger>");
    expect(html).toContain("&lt;danger&gt;");
  });
});

describe("bodyHtml", () => {
  it("returns a no-body placeholder for empty chunks", () => {
    const html = bodyHtml([]);
    expect(html).toContain("body-none");
  });

  it("renders decoded body content inside a pre block", () => {
    const encoded = Buffer.from("hello world").toString("base64");
    const html = bodyHtml([encoded]);
    expect(html).toContain("body-pre");
    expect(html).toContain("hello world");
  });

  it("pretty-prints JSON body content", () => {
    const json = JSON.stringify({ key: "value" });
    const encoded = Buffer.from(json).toString("base64");
    const html = bodyHtml([encoded]);
    // The JSON is pretty-printed but HTML-escaped inside the <pre> block
    expect(html).toContain("&quot;key&quot;");
    expect(html).toContain("&quot;value&quot;");
  });
});
