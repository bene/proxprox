console.log("Start client");

process.on("SIGINT", () => {
  console.log("Ctrl-C was pressed");
  process.exit();
});

const config = [
  {
    from: "home.bene.dev",
    to: "localhost:3000",
  },
  {
    from: "home.localhost",
    to: "localhost:3000",
  },
];

const ws = new WebSocket("ws://localhost:4550");

ws.addEventListener("error", (err) => {
  console.log(err);
});

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ type: "register", host: "home.localhost" }));
});

ws.addEventListener("message", async (message) => {
  const data = JSON.parse(message.data);

  console.log(data);

  if (data.type === "request") {
    const url = new URL(data.url);
    const configItem = config.find((c) => c.from === data.hostname);

    console.log({ configItem: configItem });

    if (!configItem) {
      return;
    }

    url.host = configItem.to;

    const res = await fetch(url, data.request);
    const buffer = await res.arrayBuffer();

    ws.send(
      JSON.stringify({
        type: "response",
        requestId: data.requestId,
        response: {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        } satisfies Pick<Response, "status" | "statusText" | "headers">,
        body: [...new Uint8Array(buffer)],
      }),
    );
  }
});
