import { describe, it, expect } from "vitest";
import porter from "./index";

describe("porter CLI command", () => {
  it("has the correct name", () => {
    expect(porter.name()).toBe("porter");
  });

  it("has a description set", () => {
    expect(porter.description()).toBeTruthy();
  });

  it("has a version set", () => {
    expect(porter.version()).toBeTruthy();
  });

  it("has the 'http' subcommand registered", () => {
    const subcommands = porter.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain("http");
  });

  it("'http' subcommand accepts a <local-port> argument", () => {
    const httpCmd = porter.commands.find((cmd) => cmd.name() === "http");
    expect(httpCmd).toBeDefined();
    const argNames = httpCmd!.registeredArguments.map((a) => a.name());
    expect(argNames).toContain("local-port");
  });

  it("'http' subcommand has a --ui-port option with default 7676", () => {
    const httpCmd = porter.commands.find((cmd) => cmd.name() === "http");
    expect(httpCmd).toBeDefined();
    const opts = httpCmd!.options;
    const uiPortOpt = opts.find((o) => o.long === "--ui-port");
    expect(uiPortOpt).toBeDefined();
    expect(uiPortOpt!.defaultValue).toBe("7676");
  });
});
