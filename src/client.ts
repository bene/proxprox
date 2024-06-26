const wsUrl = Bun.env.PROXY_WS_URL;

if (!wsUrl) {
  console.error("PROXY_WS_URL is not set");
  process.exit(1);
}

console.log("Start client");

const ws = new WebSocket(wsUrl);
const config = [
  {
    from: "home.bene.dev",
    to: "localhost:80",
  },
];

ws.addEventListener("error", (err) => {
  console.log(err);
});

ws.addEventListener("open", () => {
  ws.send(
    JSON.stringify({ type: "register", hosts: config.map((c) => c.from) }),
  );
});

ws.addEventListener("message", async (message) => {
  const data = JSON.parse(message.data);

  if (data.type === "connected") {
    console.log("Connected to proxy");
    return;
  }

  if (data.type === "request") {
    const ogUrl = new URL(data.url);
    const configItem = config.find((c) => c.from === data.hostname);

    if (!configItem) {
      return;
    }

    // Create url from original with new host
    const url = new URL(data.url);
    url.host = configItem.to;

    console.log(`${data.request.method?.padEnd(4, " ")} ${ogUrl} -> ${url}`);

    const res = await fetch(url, {
      ...data.request,
      body: data.body ? Buffer.from(data.body, "base64") : undefined,
    });
    const buffer = await res.arrayBuffer();
    const body = Buffer.from(buffer).toString("base64");

    ws.send(
      JSON.stringify({
        type: "response",
        requestId: data.requestId,
        response: {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        } satisfies Pick<Response, "status" | "statusText" | "headers">,
        body,
      }),
    );

    return;
  }

  console.error("Unknown message formt:", data);
});
