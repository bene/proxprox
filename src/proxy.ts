import { type Serve, type ServerWebSocket } from "bun";
import { randomUUID } from "crypto";

console.log("Start proxy at port:", Bun.env.BUN_PORT ?? 3000);

const connectedClients = new Map<
  string,
  {
    ws: ServerWebSocket<unknown>;
    ip: string;
  }
>();

const requestResolvers = new Map<string, (value: Response) => void>();

Bun.serve({
  fetch: async (req, server) => {
    if (server.upgrade(req)) {
      return;
    }

    const url = new URL(req.url);
    const target = connectedClients.get(url.hostname);

    console.log(
      `Proxying: ${url.hostname} -> ${target?.ip ?? "no client connected for host"}`,
    );

    if (!target) {
      return Response.json(
        { error: "no client connected for host" },
        {
          status: 404,
          headers: {
            "X-ProxProx-Status": "error",
          },
        },
      );
    }

    const requestId = randomUUID();
    const resPromise = new Promise<Response>((resolve) => {
      requestResolvers.set(requestId, resolve);
    });

    target.ws.send(
      JSON.stringify({
        requestId,
        type: "request",
        hostname: url.hostname,
        url: req.url,
        request: req,
      }),
    );

    return await resPromise;
  },
  websocket: {
    message: async (ws, message) => {
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

      console.error("Unknown message format:", data);
    },
    open: async (ws) => {
      ws.send(JSON.stringify({ type: "connected" }));
      console.log("Client connected but not registered yet");
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
});
