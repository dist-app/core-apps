#!/usr/bin/env -S deno run --allow-env --allow-sys --allow-net --allow-read --allow-write=. --allow-ffi --allow-run=node_modules/@esbuild/linux-x64/bin/esbuild --watch --allow-import --unstable-kv --unstable-broadcast-channel --unstable-cron
import { createServer as createViteServer } from 'npm:vite'

async function createViteMiddleware() {

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
        const { socket, response } = Deno.upgradeWebSocket(req, {protocol: 'vite-hmr'});
        const upstream = new WebSocket('ws://localhost:8001/'+req.url.split('/').slice(3).join('/'), ['vite-hmr']);
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
    const status = await new Promise<number>((ok, fail) => {
      // console.log(req.method, req.url);
      vite.middlewares({
        method: req.method,
        url: '/'+req.url.split('/').slice(3).join('/'),
        headers: Object.fromEntries(req.headers),
      }, {
        getHeader: (name) => respHeaders.get(name),
        setHeader: (name, value) => respHeaders.set(name, value),
        writableEnded: false,
        writeHead(statusCode, ...args) {
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
          this.writableEnded = true;
          ok(this.statusCode ?? 500);
        },
        write: (...args) => console.log('write', {args}),
      }, () => console.log('next'))
    });
    // console.log({bodyCount, respHeaders, status});
    return new Response(bodyCount ? bodyPieces.readable : null, { status, headers: respHeaders });
  }

  return handleViteRequest;
}

const viteHandler = await createViteMiddleware();



// Start up the app server
// import "dist-app-deno/hack/meteor-server/run.ts";

// import { DdpInterface, DdpSocket } from "jsr:@dist-app/stdlib@0.1.5/ddp/server";
import { CookieAuthnMethod } from "jsr:@dist-app/stdlib@0.1.5/auth/authn-methods/cookie";
import { type EntityEngine } from "jsr:@dist-app/stdlib@0.1.5/engine/types";
import { EntityEngineImpl } from "jsr:@dist-app/stdlib@0.1.5/engine/engine";
import { OidcAuthnMethod } from "jsr:@dist-app/stdlib@0.1.5/auth/authn-methods/oidc";
import { serveRestApis } from "jsr:@dist-app/stdlib@0.1.5/engine/serve-rest";

import { apiGroups, BundleConfig, entityKinds, BundleEntities } from 'dist-app-deno/server-sdk/core/entities.ts';
import { AppServer } from "dist-app-deno/server-sdk/core/app-server.ts";
import { DenoKvStorage } from "dist-app-deno/server-sdk/modules/storage-deno-kv/mod.ts";
import { mountManagePage } from 'dist-app-deno/server-sdk/modules/mount-manage-page.ts';
import { mountWebManifest } from 'dist-app-deno/server-sdk/modules/mount-webmanifest.ts';
import { setupSingleSite } from "dist-app-deno/server-sdk/core/single-site.ts";
// import { type MeteorAppBuildMeta } from '../bundle-config.ts';
import { type UserEntity } from "dist-app-deno/apis/login-server/definitions.ts";
import { type ViteAppEntity } from "dist-app-deno/apis/bundle/definitions.ts";

import { CollectionEntityApiMapping, DistInterface, SignedOutDistInterface, userNameMap } from '../_meteor-compat/server/registry.ts';
import { DdpSocketSession } from "jsr:@cloudydeno/ddp@0.1.2/server";
// import { CollectionEntityApiMapping, DistInterface, SignedOutDistInterface, userNameMap } from 'dist-app-deno/hack/meteor-server/interface/registry.ts';

for (const kind of entityKinds) {
  console.log(kind.metadata)
  const collectionName = kind.metadata.labels?.['ddp.dist.app/collection-name'];
  if (!collectionName) continue;
  CollectionEntityApiMapping.set(collectionName, {
    apiVersion: `${kind.spec.group}/${kind.spec.versions[0].name}`,
    kind: kind.spec.names.kind,
  });
}

const server = await setupSingleSite((app, siteBaseUrl) => {
  app.auth!.addAuthnMethod(new CookieAuthnMethod({
    sessionLengthDays: 14,
  }));
  app.auth!.addAuthnMethod(new OidcAuthnMethod());

  mountWebManifest(app, BundleConfig);

  app.mountPathHandler('/.well-known/openid-registration', [], () => {
    return Response.json({
      application_type: "web",
      redirect_uris: [`${siteBaseUrl}/auth/receive-oidc`],
      client_name: BundleConfig.spec.appName,
      logo_uri: `${siteBaseUrl}/-/app-icon-full.svg`,
      subject_type: "public",
      token_endpoint_auth_method: "private_key_jwt",
      jwks_uri: `${siteBaseUrl}/.well-known/jwks.json`,
      contacts: ["dan@danopia.net"], // TODO
    });
    // more docs: https://openid.net/specs/openid-connect-core-1_0.html#ClientAuthentication
  });

  app.mountPathPrefixHandler('/-/apis', [], async (req, match, user) => {
    if (!user) return new Response('not authed', {status: 404});
    const engine = await getUserEngine('dev-user');
    return await serveRestApis(req, {
      pathname: `apis/${match.pathname.groups['rest'] ?? ''}`,
      search: match.search.input,
    }, engine);
  });

  mountManagePage({
    app,
    appSlug: BundleConfig.spec.appName.replaceAll(' ', '-'),
    requireRoles: ['authed'],
    siteBaseUrl,
    getUserEngine() { return getUserEngine('dev-user'); },
    entityKinds,
  });

  app.mountPatternHandler(new URLPattern({
    pathname: '/websocket',
  }), [], async (req, _match, user) => {
    const upgrade = req.headers.get("upgrade") ?? "";
    if (upgrade.toLowerCase() != "websocket") {
      return new Response("request isn't trying to upgrade to websocket.", {
        status: 400,
      });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    const ddp = new DdpSocketSession(socket, DistInterface, 'raw');
    userNameMap.set(ddp, await getUserEngine('dev-user'));
    ddp.closePromise?.then(() => {}, () => {});
    return response;
  });

  const viteApp = BundleEntities.find(x => x.kind == 'ViteApp') as ViteAppEntity | null;
  // if (viteApp?.status?.assetsDigest && viteApp?.status.manifest) {
    // app.mountPathHandler('/', ['authed'], async (req) => {
    //   return await viteHandler(req);
    // });
    app.mountPatternHandler(new URLPattern(), [], async (req) => {
      return await viteHandler(req);
    })
  // }

});

const userEngines = new Map<string,EntityEngine>();
async function getUserEngine(userName: string): Promise<EntityEngine> {
  let engine = userEngines.get(userName);
  if (engine) return engine;

  const storage = await DenoKvStorage.openReactive(['entities', 'user', userName]);
  engine = new EntityEngineImpl();
  for (const apiGroup of apiGroups) {
    const kinds = entityKinds.filter(x => x.spec.group == apiGroup);
    engine.addApi(apiGroup, storage, {
      // TODO: multiple versions in parallel
      name: `${apiGroup}/${kinds[0].spec.versions[0].name}`,
      kinds: Object.fromEntries(kinds.map(kind => [kind.spec.names.kind, kind])),
    });
  }

  userEngines.set(userName, engine);
  return engine;
}

import './main.ts';
server.serveHttp();
