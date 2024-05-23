import { type Serve, type ServerWebSocket } from "bun";
import { randomUUID } from "crypto";

console.log("Start proxy at port:", Bun.env.BUN_PORT ?? 3000);

const hostToClientId = new Map<string, string>();
const clients = new Map<
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
    const targetClientId = hostToClientId.get(url.hostname);
    const target = clients.get(targetClientId ?? "");

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

    const buffer = await req.arrayBuffer();
    const body = Buffer.from(buffer).toString("base64");

    target.ws.send(
      JSON.stringify({
        requestId,
        type: "request",
        hostname: url.hostname,
        url: req.url,
        request: {
          method: req.method,
          headers: req.headers.toJSON(),
        },
        body,
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
        const clientId = randomUUID();
        clients.set(clientId, {
          ws,
          ip: ws.remoteAddress,
        });

        for (const host of data.hosts) {
          hostToClientId.set(host, clientId);
        }

        console.log("Client registered for:", data.hosts);
        return;
      }

      if (data.type === "response") {
        const resolveRequest = requestResolvers.get(data.requestId);

        if (!resolveRequest) {
          return;
        }

        requestResolvers.delete(data.requestId);

        resolveRequest(
          new Response(Buffer.from(data.body, "base64"), data.response),
        );

        return;
      }

      console.error("Unknown message format:", data);
    },
    open: async (ws) => {
      ws.send(JSON.stringify({ type: "connected" }));
      console.log("Client connected but not registered yet");
    },
    close: async (ws, code, message) => {
      clients.forEach((client, clientId) => {
        if (client.ws === ws) {
          clients.delete(clientId);
          hostToClientId.forEach((value, key) => {
            if (value === clientId) {
              hostToClientId.delete(key);
            }
          });
        }
      });
    },
  },
  error: async (error) => {
    return Response.json({ error: error.message }, { status: 500 });
  },
});
