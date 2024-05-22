import { type Serve, type ServerWebSocket } from "bun";
import { randomUUID } from "crypto";

console.log("Start proxy at port:", Bun.env.BUN_PORT ?? 3000);

process.on("SIGINT", () => {
  console.log("Ctrl-C was pressed");
  process.exit();
});

const connectedClients = new Map<
  string,
  {
    ws: ServerWebSocket;
    ip: string;
  }
>();

const requestResolvers = new Map<
  string,
  (value: Response | PromiseLike<Response>) => void
>();

export default {
  fetch: async (req, server) => {
    if (server.upgrade(req)) {
      return;
    }

    const url = new URL(req.url);
    const target = connectedClients.get(url.hostname);

    console.table(connectedClients);

    console.log(
      `Proxy: ${url.hostname} -> ${target?.ip ?? "host not configured"}`,
    );

    if (!target) {
      return Response.json({ error: "host not configured" }, { status: 404 });
    }

    const requestId = randomUUID();
    const resPromise = new Promise<Response>((resolve) => {
      requestResolvers.set(requestId, resolve);
    });

    const request = {
      headers: {
        ...req.headers,
        "x-bun": "true",
      },
    } satisfies FetchRequestInit;

    target.ws.send(
      JSON.stringify({
        type: "request",
        hostname: url.hostname,
        url: req.url,
        requestId,
        request,
      }),
    );

    return await resPromise;
  },
  websocket: {
    message: async (ws, message) => {
      console.log(message);

      if (typeof message !== "string") {
        return;
      }

      const data = JSON.parse(message);

      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (data.type === "register") {
        connectedClients.set(data.host, {
          ws,
          ip: ws.remoteAddress,
        });
        console.log("Client registered for:", data.host);
        return;
      }

      if (data.type === "response") {
        const resolveRequest = requestResolvers.get(data.requestId);

        if (!resolveRequest) {
          return;
        }

        requestResolvers.delete(data.requestId);

        resolveRequest(new Response(new Uint8Array(data.body), data.response));

        return;
      }
    },
    open: async (ws) => {
      ws.send(JSON.stringify({ type: "connected" }));
      console.log("Client connected but not registered");
    },
    close: async (ws, code, message) => {
      connectedClients.forEach((client, host) => {
        if (client.ws === ws) {
          connectedClients.delete(host);
        }
      });
    },
  },
  error: async (error) => {
    return Response.json({ error: error.message }, { status: 500 });
  },
} satisfies Serve;
