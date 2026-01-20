import { Command } from "commander";

import pkg from "../../package.json";
import { caller_request, createAgentSession, upgradeHandler } from "@/util/agent";
import { caller, REQ_BODY } from "@/config";

const porter = new Command();

porter.name("porter").description(pkg.description).version(pkg.version); // <-- Dynamically injected

// 1. add alias
porter
  .command("http")
  .arguments("<local-port>")
  .description("Add http port forwarding")
  .action(async (localPort) => {
    console.log(`Connecting to porter server and forwarding to local port ${localPort}`);
    createAgentSession(`http://localhost:9000`, localPort);
    // caller_request()
    //   .on("stream", upgradeHandler(localPort))
    // ;
  });

export default porter;
