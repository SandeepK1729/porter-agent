import { Command } from "commander";

import pkg from "../../package.json";
import { upgradeHandler } from "@/util/agent";
import { caller, REQ_BODY } from "@/config";

const jarvis = new Command();

jarvis.name("porter").description(pkg.description).version(pkg.version); // <-- Dynamically injected

// 1. add alias
jarvis
  .command("http")
  .arguments("<local-port>")
  .description("Add http port forwarding")
  .action(async (localPort) => {
    console.log(`Connecting to porter server and forwarding to local port ${localPort}`);
    caller.request(REQ_BODY)
      .on("response", (res) => {
        console.log("Unexpected response from server:", res.statusCode);
        res.on("data", (chunk) => {
          console.log("Response body:", chunk.toString());
        });
      })
      .on("upgrade", upgradeHandler(localPort))
      .end();
  });

export default jarvis;
