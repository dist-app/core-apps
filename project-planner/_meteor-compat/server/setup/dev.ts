import { IncomingMessage, ServerResponse } from "node:http";
import { createServer as createViteServer } from 'npm:vite'

export async function createViteMiddleware() {

  // Create Vite server in middleware mode
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      allowedHosts: ['acybox-8000.code.devmode.cloud'],
      hmr: {
        port: 8001,
        clientPort: 443,
        path: '/__hmr',
        protocol: 'wss',
      },
    },
    // don't include Vite's default HTML handling middlewares:
    // appType: 'custom',
  });

  async function handleViteRequest(req: Request) {
    // Proxy HMR websockets over to vite's npm:ws server
    if (req.url.includes('/__hmr')) {
      const upgrade = req.headers.get("upgrade") ?? "";
      if (upgrade) {
        if (upgrade.toLowerCase() != "websocket") {
          return new Response("request isn't trying to upgrade to websocket.", {
            status: 400,
          });
        }
        const protocol = req.headers.get('sec-websocket-protocol');
        if (!protocol) return new Response("no protocol requested", { status: 400 });
        if (!protocol.startsWith('vite-')) return new Response("non-vite protocol requested", { status: 400 });
        const { socket, response } = Deno.upgradeWebSocket(req, { protocol });
        const upstream = new WebSocket('ws://localhost:8001/'+req.url.split('/').slice(3).join('/'), [protocol]);
        upstream.onmessage = (msg) => socket.send(msg.data);
        socket.onmessage = (msg) => upstream.send(msg.data);
        upstream.onclose = () => socket.close();
        socket.onclose = () => upstream.close();
        return response;
      }
    }

    const respHeaders = new Headers;
    const bodyPieces = new TransformStream<Uint8Array>({},{});
    let bodyCount = 0;
    const bodyWriter = bodyPieces.writable.getWriter();
    const status = await new Promise<number>((ok, _fail) => {
      // console.log(req.method, req.url);
      vite.middlewares({
        method: req.method,
        url: '/'+req.url.split('/').slice(3).join('/'),
        headers: Object.fromEntries(req.headers),
      } as IncomingMessage, {
        getHeader: (name) => respHeaders.get(name),
        setHeader: (name, value) => respHeaders.set(name, `${value}`),
        writableEnded: false,
        writeHead(statusCode, ..._args) {
          // console.log({args})
          bodyCount++;
          ok(statusCode);
        },
        end(lastBit) {
          if (lastBit) {
            if (typeof lastBit == 'string') {
              bodyWriter.write(new TextEncoder().encode(lastBit));
            } else {
              bodyWriter.write(lastBit);
            }
            bodyCount++;
          }
          bodyWriter.close();
          //@ts-expect-error invalid write because we are polyfilling the API
          this.writableEnded = true;
          ok(this.statusCode ?? 500);
        },
        write: (...args) => console.log('write', {args}),
      } as ServerResponse, () => console.log('next'))
    });
    // console.log({bodyCount, respHeaders, status});
    return new Response(bodyCount ? bodyPieces.readable : null, { status, headers: respHeaders });
  }

  return handleViteRequest;
}

// export const viteHandler = await createViteMiddleware();
