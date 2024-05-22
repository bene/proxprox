# ProxProx · Expose local devices to the Internet

ProxProx is a simple proxy/tunnel that can be used to expose HTTP services running on devices in a local network to the public internet.

## Manual

Start the proxy on a public server with a static IP and a domain pointing to it:

```bash
docker run -p 80:3000 ghcr.io/bene/proxprox/proxprox:main --mode proxy
```

On your device (e.g. Raspberry Pi) in your local network start the client:

```bash
docker run --network host -e PROXY_WS_URL="ws://public.bene.dev" ghcr.io/bene/proxprox/proxprox:main --mode client
```
