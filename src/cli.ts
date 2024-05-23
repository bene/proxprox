import { parseArgs } from "util";

process.on("SIGINT", () => {
  process.exit();
});

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    mode: {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: true,
});

if (values.mode !== "client" && values.mode !== "proxy") {
  console.error("Invalid mode");
  process.exit(1);
}

if (values.mode === "client") {
  import("./client.ts");
}

if (values.mode === "proxy") {
  import("./proxy.ts");
}
