#!/usr/bin/env -S deno run --unstable-kv --unstable-broadcast-channel --unstable-cron --unstable-http --watch --allow-env --allow-sys --allow-read --allow-write=${HOME}/.local/share/dist-app --allow-net --no-prompt
import "https://deno.land/x/observability@v0.6.1/preconfigured/from-environment.ts";

import { DenoKvStorage } from "https://uber.danopia.net/dist-app-deno/339a41048192c8587a172734d404fb09fef0b68b/server-sdk/modules/storage-deno-kv/mod.ts";

// another example usage @ https://dash.deno.com/projects/weak-squirrel-54
import { OidcIssuer } from "https://uber.danopia.net/dist-app-deno/339a41048192c8587a172734d404fb09fef0b68b/lib/oidc/kv-issuer.ts";
import { LoginServerApi } from "https://uber.danopia.net/dist-app-deno/339a41048192c8587a172734d404fb09fef0b68b/apis/login-server/definitions.ts";
import { setupSingleSite } from "https://uber.danopia.net/dist-app-deno/339a41048192c8587a172734d404fb09fef0b68b/server-sdk/core/single-site.ts";
import { CookieAuthnMethod } from "https://uber.danopia.net/dist-app-deno/339a41048192c8587a172734d404fb09fef0b68b/lib/auth/authn-methods/cookie.ts";
import { PasskeyAuthnMethod } from "https://uber.danopia.net/dist-app-deno/339a41048192c8587a172734d404fb09fef0b68b/lib/auth/authn-methods/passkey.ts";

const server = await setupSingleSite(async (app, siteBaseUrl) => {
  app.auth.addAuthnMethod(new CookieAuthnMethod({
    sessionLengthDays: 7,
  }));
  app.auth.addAuthnMethod(new PasskeyAuthnMethod('dist.app identity', new URL(siteBaseUrl).hostname));

  const kv = await DenoKvStorage.existingKv!;
  const oidcIssuer = new OidcIssuer(kv, ['oidc', 'ecdsa'], {
    name: 'ECDSA',
    hash: 'SHA-384',
    namedCurve: 'P-384',
    // for RSA:
    // name: "RSASSA-PKCS1-v1_5",
    // hash: "SHA-512",
    // modulusLength: 2048,
    // publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
  });
  oidcIssuer.dropOldKeys();

  app.mountPathHandler('/.well-known/openid-configuration', [], () => {
    return Response.json({
      // https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata
      "issuer": `${siteBaseUrl}`,
      "authorization_endpoint": `${siteBaseUrl}/oidc/authorize`,
      "token_endpoint": `${siteBaseUrl}/oidc/redeem`,
      // userinfo_endpoint
      "jwks_uri": `${siteBaseUrl}/.well-known/jwks.json`,
      // registration_endpoint
      "scopes_supported": [ "openid", "profile", "email" ],
      // TODO: update these based on what we actually did
      "response_types_supported": [ "id_token" ], // not to spec
      "response_modes_supported": [ "query" ],
      "grant_types_supported": [ "authorization_code" ], // not to spec
      "subject_types_supported": [ "public" ],
      "id_token_signing_alg_values_supported": [ "ES384", /*"RS512"*/ ], // not to spec
      "token_endpoint_auth_methods_supported": [ "private_key_jwt" ],
      "token_endpoint_auth_signing_alg_values_supported": [ "ES384" ],
    });
  });

  app.mountPathHandler('/.well-known/jwks.json', [], async () => {
    return Response.json({
      "keys": await oidcIssuer.getCurrentKeys(),
    });
  });

  const loginServerApi = new LoginServerApi(app.auth.index);

  app.mountPathHandler('/oidc/authorize', ['authed'], async (req, _match, user) => {
    const reqUrl = new URL(req.url);
    if (!user) throw new Error('BUG: Missing auth contexxt');

    const response_type = reqUrl.searchParams.get('response_type'); // 'code'
    const client_id = reqUrl.searchParams.get('client_id'); // this.props.rootUrl
    const redirect_uri = reqUrl.searchParams.get('redirect_uri'); // origUrl.toString()
    const scope = reqUrl.searchParams.get('scope'); // 'openid'
    const state = reqUrl.searchParams.get('state'); // 'TODO:STATE'

    if (response_type !== 'code') throw new Error(`unexpected response_type`);
    if (!client_id?.startsWith('https://')) throw new Error(`this server wants URLs as client_id`);
    if (!redirect_uri) throw new Error(`expected redirect_uri`);
    if (!redirect_uri.startsWith(client_id)) throw new Error(`redirect_uri should be within client-id`);
    if (scope !== 'openid') throw new Error(`unexpected scope`);
    if (typeof state !== 'string') throw new Error(`this server requires state values`);

    // TODO(SECURITY): further validate redirect_uri

    const expiresAfter = new Date();
    expiresAfter.setSeconds(expiresAfter.getSeconds() + 90);

    const code = crypto.randomUUID().split('-')[4];
    await loginServerApi.createOpenidConnectCode({
      metadata: {
        name: code,
      },
      spec: {
        state,
        callbackUrl: redirect_uri,
        issuer: siteBaseUrl,
        audience: client_id,
        expiresAfter,
        userName: user.metadata.name,
        claimsJson: JSON.stringify({
          'profile': {
            'username': user.metadata.name,
            // 'domain': user.spec.
            'display_name': user.spec.profile.displayName,
          },
          'iss': siteBaseUrl,
          'aud': client_id,
          'sub': `user:uid:${user.metadata.uid}`,
          'scope': scope,
          'amr': ['swk'], // should be hwk when passkey is not synced, pwd for password, otp for magic link
        }),
      },
    });

    const newUrl = new URL(redirect_uri);
    newUrl.searchParams.set('code', code);
    newUrl.searchParams.set('state', state);

    return Promise.resolve(new Response('Redirecting to application', {
      status: 302,
      headers: {
        location: newUrl.toString(),
      },
    }));
  });

  app.mountPathHandler('/oidc/redeem', [], async req => {
    if (req.method !== 'POST') return new Response('405', { status: 405 });
    if (req.headers.get('content-type') !== 'application/x-www-form-urlencoded') {
      return new Response('want application/x-www-form-urlencoded', { status: 400 });
    }
    const reqBody = new URLSearchParams(await req.text());

    const code = reqBody.get('code'); // 'TODO:CODE'
    const grant_type = reqBody.get('grant_type'); // 'authorization_code'
    const redirect_uri = reqBody.get('redirect_uri');

    if (grant_type !== 'authorization_code') throw new Error(`unexpected grant_type`);
    // if (code !== 'TODO:CODE') throw new Error(`unexpected code`);
    if (typeof code !== 'string') throw new Error(`expected code`);

    const codeData = await loginServerApi.getOpenidConnectCode(code);
    if (!codeData) throw new Error(`unknown code`);
    if (codeData.spec.callbackUrl !== redirect_uri) throw new Error(`unexpected redirect_uri`);

    const accessJwt = await oidcIssuer.signJwt({
      ...JSON.parse(codeData.spec.claimsJson),
    });

    const idJwt = await oidcIssuer.signJwt({
      ...JSON.parse(codeData.spec.claimsJson),
      // Claims are added based on scopes, see https://openid.net/specs/openid-connect-core-1_0.html#Claims
      preferred_username: codeData.spec.userName,
    });

    // TODO: keep instead, set status and allow for automatic cleanup
    await loginServerApi.deleteOpenidConnectCode(code);

    return Response.json({
      "access_token": accessJwt,
      "token_type": "Bearer",
      "expires_in": 3600,
      // "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
      "id_token": idJwt,
    });
  });

}, {
  authKvPrefix: ['entities', 'local-index'],
});
server.serveHttp();
