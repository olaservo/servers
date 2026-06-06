#!/usr/bin/env node

// Parse the requested transport and lazily import only that module.
const args = process.argv.slice(2);
const scriptName = args[0] || "stdio";

async function run() {
  try {
    switch (scriptName) {
      case "stdio":
        await import("./transports/stdio.js");
        break;
      case "streamableHttp":
        await import("./transports/streamableHttp.js");
        break;
      default:
        console.error(`-`.repeat(53));
        console.error(`  List Resources Demo Server`);
        console.error(`  Usage: node ./index.js [stdio|streamableHttp]`);
        console.error(`  Default transport: stdio`);
        console.error(`-`.repeat(53));
        console.error(`Unknown transport: ${scriptName}`);
        process.exit(1);
    }
  } catch (error) {
    console.error("Error running script:", error);
    process.exit(1);
  }
}

await run();
