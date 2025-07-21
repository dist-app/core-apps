#!/usr/bin/env -S deno run --allow-env --allow-sys --allow-net --allow-read --allow-write=. --allow-ffi --allow-run=node_modules/@esbuild/linux-x64/bin/esbuild --watch --allow-import --unstable-kv --unstable-broadcast-channel --unstable-cron

import { setupSingleSite } from "dist-app-deno/server-sdk/core/single-site.ts";
import * as logic from './logic.ts';
logic.registerCollections();
import '../../server/main.ts';
const server = await setupSingleSite((app, siteBaseUrl) => {
  logic.setupAppBasics(app, siteBaseUrl);
  logic.attachMultiUserRoutes(app, siteBaseUrl);
  logic.withViteApp(viteApp => {
    logic.attachViteAssetRoutes(app, viteApp, ['authed']);
  });
});
server.serveHttp();
