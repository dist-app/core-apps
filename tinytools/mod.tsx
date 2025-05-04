#!/usr/bin/env -S deno run --unstable --watch --allow-env --allow-sys --allow-read --allow-net=0.0.0.0,dist-v1alpha1.deno.dev,otel.devmode.cloud
/** @jsxRuntime automatic *//** @jsxImportSource jsr:@hono/hono@4.7.7/jsx */
import "jsr:@cloudydeno/opentelemetry@0.10.0/register";
import { html } from "jsr:@dist-app/stdlib@0.1.3/support/html";

import { JsonUrlLoader } from "https://uber.danopia.net/dist-app-deno/59be68e513fd9f6d8b2037c66e4194846d20a039/server-sdk/modules/loader-json-url.ts";
import { svgForIcon } from "https://uber.danopia.net/dist-app-deno/59be68e513fd9f6d8b2037c66e4194846d20a039/apis/manifest/icon.ts";
import { setupSingleSite } from "https://uber.danopia.net/dist-app-deno/59be68e513fd9f6d8b2037c66e4194846d20a039/server-sdk/core/single-site.ts";

const server = await setupSingleSite((app, _siteBaseUrl) => {

  app.mountWebManifest('/app.webmanifest', {
    name: 'Tiny Web-based Tools',
    short_name: 'Tiny Tools',
    start_url: '.',
    id: '/',
    display: 'minimal-ui',
    theme_color: 'rgb(51, 102, 51)',
    background_color: '#333',
    description: 'Various simple developer utilities for working with encodings and more',
    icons: [{
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'maskable',
      src: 'app-icon-maskable.svg',
    }, {
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
      src: 'app-icon-full.svg',
    }],
  });
  app.mountPathHandler('/app-icon-maskable.svg', [], () => new Response(svgForIcon({
    type: 'glyph',
    glyph: {
      text: '👨‍💻',
      backgroundColor: 'rgb(51, 102, 51)',
    },
  }, '5 5 50 50'), {
    headers: {
      'content-type': 'image/svg+xml',
    },
  }));
  app.mountPathHandler('/app-icon-full.svg', [], () => new Response(svgForIcon({
    type: 'glyph',
    glyph: {
      text: '👨‍💻',
      backgroundColor: 'rgb(51, 102, 51)',
    },
  }, '10 10 40 40'), {
    headers: {
      'content-type': 'image/svg+xml',
    },
  }));

  app.mountPublicApp('/tools/http-client/', {
    loader: new JsonUrlLoader('https://dist-v1alpha1.deno.dev/debug/dump-catalog/86834d4d'),
    activityName: 'main',
    persistKey: 'http-client',
    requireRoles: [],
  });

  app.mountPublicApp('/tools/', {
    loader: new JsonUrlLoader('https://dist-v1alpha1.deno.dev/debug/dump-catalog/5c0c3d8f'),
    activityName: 'launcher',
    persistKey: 'toolbelt',
    requireRoles: [],
  });

  app.mountPathHandler('/', [], _ => {
    return html({
      lang: "en",
      title: "Tiny Web Tools",
      meta: {
        description: "Various simple developer utilities for working with encodings and more",
      },
      links: [
        { rel: 'manifest', href: '/app.webmanifest' },
      ],
      styles: [
        `h1, h2 {
          margin: 0.3em 1em;
          padding: 1em 0 0.5em;
          color: #999;
        }
        body {
          margin: 0;
          background-color: #222;
          color: #fff;
          font-family: monospace;
        }
        #tool-list {
          list-style: none;
          padding: 0;
          margin: 1em;
          box-sizing: border-box;
          display: flex;
          flex-wrap: wrap;
          gap: 1.5em;
        }
        @media (min-width: 640px) {
          body {
            font-size: 1.1em;
          }
        }
        @media (min-width: 1200px) {
          body {
            font-size: 1.2em;
          }
        }
        .wrap {
          max-width: 100em;
          padding: 0.5em;
          background-color: #333;
        }
        #tool-list li {
          flex: 20em 1 0;
          display: grid;
        }
        #tool-list a {
          display: flex;
          text-align: center;
          align-items: center;
          justify-content: center;
          padding: 1em;
          box-sizing: border-box;
          font-size: 1.6em;
          background-color: rgba(200, 200, 200, 0.5);
          color: #fff;
          transition: background-color 0.2s linear;
        }
        #tool-list a:not(:hover) {
          text-decoration: none;
          background-color: rgba(200, 200, 200, 0.3);
        }`.replace(/^ {6}/gm, ''),
      ],
      body: (
        <div class="wrap">
          <h1>👨&zwj;💻 Tiny Tools</h1>
          <h2>Encodings and Conversions</h2>
          <ul id="tool-list">
            <li><a href="/tools/base64">Base64 encode/decode</a></li>
            <li><a href="/tools/pretty-json">JSON formatter</a></li>
            <li><a href="/tools/jwt">JWT inspector</a></li>
            <li><a href="/tools/urlencode">urlencode & urldecode</a></li>
            <li><a href="/tools/timestamp">UNIX epoch timestamps</a></li>
            <li />
            <li />
            <li />
          </ul>
          <h2>Lookups</h2>
          <ul id="tool-list">
            <li><a href="/tools/aws-ips">IP ownership</a></li>
            <li><a href="/tools/google-dns">DNS resolver</a></li>
            <li><a href="/tools/http-client/">HTTP client</a></li>
            <li />
            <li />
            <li />
          </ul>
        </div>
      ),
    });
  });

});
server.serveHttp();
