import { describe, it, expect, beforeEach } from "vitest";
import Storage from "./index";

describe("Storage", () => {
  let store: Storage<string>;

  beforeEach(() => {
    store = new Storage<string>();
  });

  it("starts empty", () => {
    expect(store.size()).toBe(0);
    expect(store.hasData()).toBe(false);
  });

  it("stores and retrieves a value", () => {
    store.set("key1", "value1");
    expect(store.get("key1")).toBe("value1");
    expect(store.size()).toBe(1);
    expect(store.hasData()).toBe(true);
  });

  it("returns undefined for a missing key", () => {
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("has() returns true for existing keys", () => {
    store.set("k", "v");
    expect(store.has("k")).toBe(true);
    expect(store.has("missing")).toBe(false);
  });

  it("getValues() returns all stored values", () => {
    store.set("a", "1");
    store.set("b", "2");
    const values = store.getValues();
    expect(values).toHaveLength(2);
    expect(values).toContain("1");
    expect(values).toContain("2");
  });

  it("delete() removes a specific entry", () => {
    store.set("a", "1");
    store.set("b", "2");
    store.delete("a");
    expect(store.has("a")).toBe(false);
    expect(store.size()).toBe(1);
  });

  it("clear() removes all entries", () => {
    store.set("a", "1");
    store.set("b", "2");
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.hasData()).toBe(false);
  });
});
