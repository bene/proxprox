import { parseArgs } from "util";

process.on("SIGINT", () => {
  process.exit();
});

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    mode: {
      type: "string",
      short: "m",
    },
  },
  strict: true,
  allowPositionals: true,
});

const mode = Bun.env.MODE ?? values.mode;

if (!mode) {
  console.error("No mode specified");
  console.error("Pass -m [client|proxy] or set MODE env variable");
  process.exit(1);
}

if (mode !== "client" && mode !== "proxy") {
  console.error("Invalid mode");
  process.exit(1);
}

if (mode === "client") {
  import("./client.ts");
}

if (mode === "proxy") {
  import("./proxy.ts");
}
