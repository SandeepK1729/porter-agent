import { Command } from "commander";

import pkg from "../../package.json";
import { upgradeHandler } from "@/util/agent";
import { caller, REQ_BODY } from "@/config";
import { startUIServer } from "@/ui/server";

const porter = new Command();

porter.name("porter").description(pkg.description).version(pkg.version); // <-- Dynamically injected

// 1. add alias
porter
  .command("http")
  .arguments("<local-port>")
  .description("Add http port forwarding")
  .option("--ui-port <port>", "Port for the web UI dashboard", "7676")
  .action(async (localPort, options: { uiPort: string }) => {
    startUIServer(parseInt(options.uiPort, 10));
    console.log(`Connecting to porter server and forwarding to local port ${localPort}`);
    caller.request(REQ_BODY)
      .on("error", (err) =>
        console.error(
          `Connection to porter server failed: ${err.message}\n` +
          `Make sure the porter server is reachable and try again.`,
        ),
      )
      .on("upgrade", upgradeHandler(localPort))
      .end();
  });

export default porter;
