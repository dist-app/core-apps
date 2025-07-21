#!/usr/bin/env -S deno run --allow-env --allow-sys --allow-net --allow-read --allow-write=. --allow-ffi --allow-run=node_modules/@esbuild/linux-x64/bin/esbuild --watch --allow-import --unstable-kv --unstable-broadcast-channel --unstable-cron

const isSingleUser = Deno.env.get('DIST_BUNDLE_SINGLE_USER') == 'true';
const isDev = Deno.env.get('DIST_BUNDLE_DEV') == 'true';

import { BundleEntities } from 'dist-app-deno/server-sdk/core/entities.ts';
import { setupSingleSite } from "dist-app-deno/server-sdk/core/single-site.ts";
import type { ViteAppEntity } from "dist-app-deno/apis/bundle/entities.ts";

import * as logic from './logic.ts';
logic.registerCollections();

import { createViteMiddleware } from "./setup/dev.ts";
const viteHandler = isDev ? await createViteMiddleware() : null;

const server = await setupSingleSite((app, siteBaseUrl) => {
  logic.setupAppBasics(app, siteBaseUrl);

  if (isSingleUser) {
    logic.attachSingleUserRoutes(app, siteBaseUrl);
  } else {
    logic.attachMultiUserRoutes(app, siteBaseUrl);
  }
  const viteApp = BundleEntities.find(x => x.kind == 'ViteApp') as ViteAppEntity | null;
  if (viteApp) {
    const requireRoles = isSingleUser ? [] : ['authed'];
    if (viteHandler) {
      // vite uses a lot of crazy URLs. don't try to contain it
      app.mountPatternHandler(new URLPattern(), requireRoles, viteHandler);
    } else if (viteApp?.status?.assetsDigest && viteApp?.status.manifest) {
      logic.attachViteAssetRoutes(app, viteApp, requireRoles);
    }
  }
});

import '../../server/main.ts';
server.serveHttp();


// import { setupSingleSite } from "dist-app-deno/server-sdk/core/single-site.ts";
// import * as logic from './logic.ts';
// logic.registerCollections();
// import '../../server/main.ts';
// const server = await setupSingleSite(async (app, siteBaseUrl) => {
//   logic.setupAppBasics(app, siteBaseUrl);
//   logic.attachMultiUserRoutes(app, siteBaseUrl);
//   await logic.withViteApp(async viteApp => {
//     await logic.attachViteAssetRoutes(app, viteApp);
//   });
// });
// server.serveHttp();
