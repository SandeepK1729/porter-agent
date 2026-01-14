import { spawn, SpawnOptions } from "child_process";
import { Command } from "commander";
import { spinner } from "@clack/prompts";

import pkg from '../../package.json';

const jarvis = new Command();

jarvis
  .name('porter')
  .description(pkg.description)
  .version(pkg.version); // <-- Dynamically injected

// 1. add alias
jarvis
  .command("alias")
  .description("Add a new alias")
  .action(async () => {
    // const alias: Alias = await aliasInput();

    // const s = spinner();
    // s.start(`Adding alias '${alias}'...`);

    // const result = addAlias(alias);
    // s.stop(`Added alias '${result.alias}' to run command: '${result.command}'`);
  });

// 3. list aliases
jarvis
  .command("list")
  .description("List all aliases")
  .action(() => {
    const aliases = [{}];
    console.table(aliases, ["command", "path"]);
  });

export default jarvis;
