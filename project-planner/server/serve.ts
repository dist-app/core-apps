
// Start up the app server
// import "https://uber.danopia.net/dist-app-deno/c993378637def2703fe49de5f5c3dc01088e8c58/hack/meteor-server/run.ts";

import { DdpInterface, DdpSocket } from "jsr:@dist-app/stdlib@0.1.5/ddp/server";
import { CookieAuthnMethod } from "jsr:@dist-app/stdlib@0.1.5/auth/authn-methods/cookie";
import { type EntityEngine } from "jsr:@dist-app/stdlib@0.1.5/engine/types";
import { EntityEngineImpl } from "jsr:@dist-app/stdlib@0.1.5/engine/engine";
import { OidcAuthnMethod } from "jsr:@dist-app/stdlib@0.1.5/auth/authn-methods/oidc";
import { serveRestApis } from "jsr:@dist-app/stdlib@0.1.5/engine/serve-rest";

import { apiGroups, BundleConfig, entityKinds, BundleEntities } from 'https://uber.danopia.net/dist-app-deno/c993378637def2703fe49de5f5c3dc01088e8c58/server-sdk/core/entities.ts';
import { AppServer } from "https://uber.danopia.net/dist-app-deno/c993378637def2703fe49de5f5c3dc01088e8c58/server-sdk/core/app-server.ts";
import { DenoKvStorage } from "https://uber.danopia.net/dist-app-deno/c993378637def2703fe49de5f5c3dc01088e8c58/server-sdk/modules/storage-deno-kv/mod.ts";
import { mountManagePage } from 'https://uber.danopia.net/dist-app-deno/c993378637def2703fe49de5f5c3dc01088e8c58/server-sdk/modules/mount-manage-page.ts';
import { mountWebManifest } from 'https://uber.danopia.net/dist-app-deno/c993378637def2703fe49de5f5c3dc01088e8c58/server-sdk/modules/mount-webmanifest.ts';
import { setupSingleSite } from "https://uber.danopia.net/dist-app-deno/c993378637def2703fe49de5f5c3dc01088e8c58/server-sdk/core/single-site.ts";
// import { type MeteorAppBuildMeta } from '../bundle-config.ts';
import { type UserEntity } from "https://uber.danopia.net/dist-app-deno/c993378637def2703fe49de5f5c3dc01088e8c58/apis/login-server/definitions.ts";
import { type ViteAppEntity } from "https://uber.danopia.net/dist-app-deno/c993378637def2703fe49de5f5c3dc01088e8c58/apis/bundle/definitions.ts";

import { CollectionEntityApiMapping, DistInterface, SignedOutDistInterface, userNameMap } from 'https://uber.danopia.net/dist-app-deno/c993378637def2703fe49de5f5c3dc01088e8c58/hack/meteor-server/interface/registry.ts';

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

  app.mountPathPrefixHandler('/-/apis', ['authed'], async (req, match, user) => {
    if (!user) return new Response('not authed', {status: 404});
    const engine = await getUserEngine(user);
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
    getUserEngine,
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
      const ddp = new DdpSocket(socket, SignedOutDistInterface, 'raw');
      ddp.closePromise.then(() => {}, () => {});
      return response;
      // return new Response('not authed', {status: 404});
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    const ddp = new DdpSocket(socket, DistInterface, 'raw');
    userNameMap.set(ddp, await getUserEngine(user));
    ddp.closePromise.then(() => {}, () => {});
    return response;
  });

  const viteApp = BundleEntities.find(x => x.kind == 'ViteApp') as ViteAppEntity | null;
  if (viteApp?.status?.assetsDigest && viteApp?.status.manifest) {
    const blobUrl = Deno.env.get(`bloburl:${viteApp.status.assetsDigest}`);
    if (!blobUrl) {
      console.log('Blob', viteApp.status.assetsDigest, 'not available, skipping assets setup');
    } else {
      console.log('Setting up asset server...');
      app.mountPathPrefixHandler('/assets', ['authed'], async (_req, match) => {
        const assetName = match.pathname.groups?.['rest'];
        if (!assetName) return new Response('', { status: 404 });
        const assetResp = await fetch(new URL(`assets/${assetName}`, `${blobUrl}/`));
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
      app.mountPathHandler('/', ['authed'], async () => {
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

});

const userEngines = new Map<string,EntityEngine>();
async function getUserEngine(user: UserEntity): Promise<EntityEngine> {
  let engine = userEngines.get(user.metadata.name);
  if (engine) return engine;

  const storage = await DenoKvStorage.openReactive(['entities', 'user', user.metadata.name]);
  engine = new EntityEngineImpl();
  for (const apiGroup of apiGroups) {
    const kinds = entityKinds.filter(x => x.spec.group == apiGroup);
    engine.addApi(apiGroup, storage, {
      // TODO: multiple versions in parallel
      name: `${apiGroup}/${kinds[0].spec.versions[0].name}`,
      kinds: Object.fromEntries(kinds.map(kind => [kind.spec.names.kind, kind])),
    });
  }

  userEngines.set(user.metadata.name, engine);
  return engine;
}

server.serveHttp();
