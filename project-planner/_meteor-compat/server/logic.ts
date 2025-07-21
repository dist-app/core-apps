#!/usr/bin/env -S deno run --allow-env --allow-sys --allow-net --allow-read --allow-write=. --allow-ffi --allow-run=node_modules/@esbuild/linux-x64/bin/esbuild --watch --allow-import --unstable-kv --unstable-broadcast-channel --unstable-cron

// Start up the app server
// import "dist-app-deno/hack/meteor-server/run.ts";

// import { DdpInterface, DdpSocket } from "jsr:@dist-app/stdlib@0.1.5/ddp/server";
import { CookieAuthnMethod } from "jsr:@dist-app/stdlib@0.1.5/auth/authn-methods/cookie";
import { type EntityEngine } from "jsr:@dist-app/stdlib@0.1.5/engine/types";
import { EntityEngineImpl } from "jsr:@dist-app/stdlib@0.1.5/engine/engine";
import { OidcAuthnMethod } from "jsr:@dist-app/stdlib@0.1.5/auth/authn-methods/oidc";
import { serveRestApis } from "jsr:@dist-app/stdlib@0.1.5/engine/serve-rest";

import { apiGroups, BundleConfig, entityKinds, BundleEntities } from 'dist-app-deno/server-sdk/core/entities.ts';
// import { AppServer } from "dist-app-deno/server-sdk/core/app-server.ts";
import { DenoKvStorage } from "dist-app-deno/server-sdk/modules/storage-deno-kv/mod.ts";
import { mountManagePage } from 'dist-app-deno/server-sdk/modules/mount-manage-page.ts';
import { mountWebManifest } from 'dist-app-deno/server-sdk/modules/mount-webmanifest.ts';
// import { setupSingleSite } from "dist-app-deno/server-sdk/core/single-site.ts";
// import { type MeteorAppBuildMeta } from '../bundle-config.ts';
// import { type UserEntity } from "dist-app-deno/apis/login-server/definitions.ts";
import type { ViteAppEntity } from "dist-app-deno/apis/bundle/entities.ts";

import { CollectionEntityApiMapping, DistInterface, SignedOutDistInterface, userNameMap } from './registry.ts';
import { DdpSocketSession } from "jsr:@cloudydeno/ddp@0.1.2/server";
import { AppServer } from "dist-app-deno/server-sdk/core/app-server.ts";
// import { CollectionEntityApiMapping, DistInterface, SignedOutDistInterface, userNameMap } from 'dist-app-deno/hack/meteor-server/interface/registry.ts';

export function registerCollections() {
  for (const kind of entityKinds) {
    // console.log(kind.metadata)
    const collectionName = kind.metadata.labels?.['ddp.dist.app/collection-name'];
    if (!collectionName) continue;
    CollectionEntityApiMapping.set(collectionName, {
      apiVersion: `${kind.spec.group}/${kind.spec.versions[0].name}`,
      kind: kind.spec.names.kind,
    });
    console.log('Registered DDP collection', collectionName);
  }
}

export function setupAppBasics(app: AppServer, siteBaseUrl: string) {
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
}

export function attachSingleUserRoutes(app: AppServer, siteBaseUrl: string) {
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
    requireRoles: [],
    siteBaseUrl,
    getUserEngine() { return getUserEngine('dev-user'); },
    entityKinds,
  });

  app.mountPatternHandler(new URLPattern({
    pathname: '/websocket',
  }), [], async (req, _match, _user) => {
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
}

export function attachMultiUserRoutes(app: AppServer, siteBaseUrl: string) {
  app.mountPathPrefixHandler('/-/apis', ['authed'], async (req, match, user) => {
    if (!user) return new Response('not authed', {status: 404});
    const engine = await getUserEngine(user.metadata.uid!);
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
    getUserEngine(user) { return getUserEngine(user.metadata.uid!); },
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

    if (!user) {
      const { socket, response } = Deno.upgradeWebSocket(req);
      const ddp = new DdpSocketSession(socket, SignedOutDistInterface, 'raw');
      ddp.closePromise?.then(() => {}, () => {});
      return response;
      // return new Response('not authed', {status: 404});
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    const ddp = new DdpSocketSession(socket, DistInterface, 'raw');
    userNameMap.set(ddp, await getUserEngine(user.metadata.uid!));
    ddp.closePromise?.then(() => {}, () => {});
    return response;
  });
}

// export async function attachViteDevRoutes(app: AppServer, viteApp: ViteAppEntity) {
//   const devSetup = await import('./setup/dev.ts');
//   const viteHandler = await devSetup.createViteMiddleware();
//   app.mountPatternHandler(new URLPattern(), [], viteHandler);
// }

export function attachViteAssetRoutes(app: AppServer, viteApp: ViteAppEntity, requireRoles: Array<string>) {
  if (!viteApp?.status?.assetsDigest || !viteApp?.status.manifest) {
    throw new Error(`BUG: ViteApp missing a build`);
  }

  const blobUrl = Deno.env.get(`bloburl:${viteApp.status.assetsDigest}`);
  if (!blobUrl) {
    console.log('Blob', viteApp.status.assetsDigest, 'not available, skipping assets setup');
  } else {
    console.log('Setting up asset server...');
    app.mountPathPrefixHandler('/assets', requireRoles, async (_req, match) => {
      console.log('req', match);
      const assetName = match.pathname.groups?.['rest'];
      if (!assetName) return new Response('', { status: 404 });
      console.log('before', assetName, blobUrl);
      const assetUrl = new URL(`assets/${assetName}`, `${blobUrl}/`);
      console.log('hi', assetUrl);
      const assetResp = await fetch(assetUrl);
      console.log('ok', assetResp.status, assetResp.headers);
      if (!assetResp.ok) {
        return new Response('', { status: 500 });
      }
      let contentType = assetResp.headers.get('content-type');
      if (assetName.endsWith('.js')) {
        contentType ??= 'application/javascript';
      }
      if (assetName.endsWith('.css')) {
        contentType ??= 'text/css; charset=utf-8';
      }
      return new Response(assetResp.body, {
        headers: {
          'content-type': contentType ?? 'application/octet-stream',
        },
      });
    });
  }
  const indexHtml = viteApp.status.manifest['index.html'];
  if (indexHtml) {
    app.mountPathHandler('/', requireRoles, async () => {
      const assetResp = await fetch(new URL('index.html', `${blobUrl}/`));
      if (!assetResp.ok) {
        return new Response('', { status: 500 });
      }
      const assetText = await assetResp.text();
      return new Response(assetText, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      });
    });
  }
}

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

export function withViteApp(doFunc: (viteApp: ViteAppEntity) => void) {
  const viteApp = BundleEntities.find(x => x.kind == 'ViteApp') as ViteAppEntity | null;
  if (viteApp) {
    doFunc(viteApp);
  }
}
