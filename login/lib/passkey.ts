// v10 changes some datatypes:
// https://github.com/MasterKale/SimpleWebAuthn/releases/tag/v10.0.0
import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse } from 'https://deno.land/x/simplewebauthn@v9.0.0/deno/server.ts';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from 'https://deno.land/x/simplewebauthn@v9.0.0/packages/types/src/index.ts';
import { encodeBase64Url } from "https://deno.land/std@0.208.0/encoding/base64url.ts";

import type { EntityEngine } from "https://uber.danopia.net/dist-app-deno/52605ca9fa7d2f5d0a26961f29f1d864c9966352/lib/portable/engine.ts";
import type { PasskeyAssociationEntity, PasskeyChallengeEntity, UserEntity } from 'https://uber.danopia.net/dist-app-deno/52605ca9fa7d2f5d0a26961f29f1d864c9966352/lib/../apis/login-server/definitions.ts';
import type { AuthRequestContext, AuthRpcHandler, AuthSystem, AuthnMethod } from "https://uber.danopia.net/dist-app-deno/52605ca9fa7d2f5d0a26961f29f1d864c9966352/lib/auth/types.ts";
import { PasskeysTab } from './passkeys-ui.tsx';

export class PasskeyAuthnMethod implements AuthnMethod {
  readonly methodId = 'passkey';

  constructor(
    public readonly rpName: string,
    public readonly rpID: string,
  ) {}

  // Passkeys are only interacted with by a browser page via RPC.
  // There are no header semantics.
  recognizeUser(): Promise<false> {
    return Promise.resolve(false);
  }
  observeSignin(): Promise<false> {
    return Promise.resolve(false);
  }

  listPaths() {
    return {};
  }
  // serveSignin?(auth: AuthSystem, ctx: AuthRequestContext): Promise<Response> {
  //   throw new Error('Method not implemented.');
  // }

  settingsTabs = [PasskeysTab];

  async runMaintanence(auth: AuthSystem) {
    const cutoffDate = new Date;
    cutoffDate.setMinutes(cutoffDate.getMinutes() - 10);
    const challenges = await auth.index.listEntityHandles<PasskeyChallengeEntity>("login-server.dist.app/v1alpha1", "PasskeyChallenge");
    let deleted = 0;
    for (const hChallenge of challenges) {
      const creationTimestamp = hChallenge.snapshot?.metadata.creationTimestamp;
      if (creationTimestamp && creationTimestamp < cutoffDate) {
        await hChallenge.delete();
        deleted++;
      }
    }
    if (deleted) {
      console.debug("Deleted", deleted, "passkey challenges older than", cutoffDate);
    }
  }

  // bindTo(framework: AuthFramework) {

  // }

  listRpcs(auth: AuthSystem): Record<string, AuthRpcHandler> {
    return {

      'removePasskey': async (_ctx, user, props) => {
        if (!user) throw new Error(`Not already logged in`);

        const passkeyName = props.passkeyName as string;
        const hPasskeyAssociation = auth.index.getEntityHandle<PasskeyAssociationEntity>(
          "login-server.dist.app/v1alpha1", "PasskeyAssociation",
          passkeyName);

        const existing = await hPasskeyAssociation.get();
        if (!existing) throw new Error('No known passkey');
        if (existing.spec.userName !== user.metadata.name) throw new Error('Invalid passkey to delete');

        await hPasskeyAssociation.delete();
        return { ok: true };
      },

      'startRegister': async (ctx, user, _props) => {
        if (!user) throw new Error(`Not already logged in`);

        // TODO: scalability
        const existingPasskeys = await auth.index
          .listEntities<PasskeyAssociationEntity>(
            'login-server.dist.app/v1alpha1', 'PasskeyAssociation')
          .then(x => x
            .filter(y => y.spec.userName == user.metadata.name));

        const options = await generateRegistrationOptions({
          rpName: this.rpName,
          rpID: this.rpID,
          userID: user.metadata.uid!,
          userName: user.metadata.name,
          userDisplayName: user.spec.profile.contactEmail,
          excludeCredentials: existingPasskeys.map(x => ({
            id: x.spec.credential.id,
            type: 'public-key',
            transports: x.spec.credential.transports,
          })),
          authenticatorSelection: {
            residentKey: 'required', // we want a discoverable key
            userVerification: 'preferred', // helps with UX to not have 'required', apparently
            // authenticatorAttachment: 'cross-platform', // syncablekeys
          },
        });

        await issuePasskeyChallenge(auth.index, ctx, options.challenge, 'webauthn.create', options.timeout, user.metadata.name);
        return {...options};
      },

      'submitRegister': async (ctx, user, props) => {
        if (!user) throw new Error(`Not already logged in`);

        const challenge = await retrieveCookieChallenge(auth.index, ctx, 'webauthn.create');
        if (!challenge) throw new Error(`no PasskeyChallenge matched your cookie`);

        const registerResp = props.authn as RegistrationResponseJSON;
        const verification = await verifyRegistrationResponse({
          response: registerResp,
          expectedChallenge: challenge,
          expectedOrigin: new URL(auth.selfBaseUrl).origin,
          expectedRPID: this.rpID,
        });
        if (!verification.verified || !verification.registrationInfo) {
          throw new Error(`Verification failed`);
        }

        const hPasskeyAssociation = auth.index.getEntityHandle<PasskeyAssociationEntity>(
          'login-server.dist.app/v1alpha1', 'PasskeyAssociation',
          encodeBase64Url(verification.registrationInfo.credentialID));
        if (await hPasskeyAssociation.get()) {
          throw new Error(`That passkey is already known to this server.`);
        }

        const hPasskey = await auth.index.insertEntity<PasskeyAssociationEntity>({
          apiVersion: 'login-server.dist.app/v1alpha1',
          kind: 'PasskeyAssociation',
          metadata: {
            name: encodeBase64Url(verification.registrationInfo.credentialID),
          },
          spec: {
            userName: user.metadata.name,
            credential: {
              backedUp: verification.registrationInfo.credentialBackedUp,
              deviceType: verification.registrationInfo.credentialDeviceType,
              id: verification.registrationInfo.credentialID,
              publicKey: verification.registrationInfo.credentialPublicKey,
              //@ts-expect-error: docs say it's there...
              transports: verification.registrationInfo.transports,
            },
            aaguid: verification.registrationInfo.aaguid,
            details: {
              fmt: verification.registrationInfo.fmt,
              origin: verification.registrationInfo.origin,
              rpID: verification.registrationInfo.rpID ?? this.rpID,
              json: JSON.stringify(verification.registrationInfo),
            },
          },
          status: {
            counter: verification.registrationInfo.counter || void 0,
            lastSeen: new Date,
          },
        });

        return {...await hPasskey.get()};
      },

      'startSignin': async (ctx, _user, _props) => {
        const options = await generateAuthenticationOptions({
          rpID: this.rpID,
          userVerification: 'preferred',
        });

        await issuePasskeyChallenge(auth.index, ctx, options.challenge, 'webauthn.get', options.timeout);
        return {...options};
      },

      'submitSignin': async (ctx, _user, props) => {
        const loginResp = props.authn as AuthenticationResponseJSON;

        const challenge = await retrieveCookieChallenge(auth.index, ctx, 'webauthn.get');
        if (!challenge) {
          throw new Error(`no PasskeyChallenge matched your cookie`);
        }

        const hPasskeyAssociation = auth.index.getEntityHandle<PasskeyAssociationEntity>(
          'login-server.dist.app/v1alpha1', 'PasskeyAssociation',
          loginResp.id);
        const passkey = await hPasskeyAssociation.get();
        if (!passkey) {
          throw new Error("That passkey is not known to this server.");
        }

        const verification = await verifyAuthenticationResponse({
          response: loginResp,
          expectedChallenge: challenge,
          expectedOrigin: new URL(auth.selfBaseUrl).origin,
          expectedRPID: this.rpID,
          authenticator: {
            counter: passkey.status?.counter ?? 0,
            credentialID: passkey.spec.credential.id,
            credentialPublicKey: passkey.spec.credential.publicKey,
            transports: passkey.spec.credential.transports,
          },
        });

        if (!verification.verified) {
          throw new Error(`Passkey login failed verification.`);
        }
        if (passkey.status?.counter) {
          if (verification.authenticationInfo.newCounter < passkey.status.counter) {
            throw new Error(`Passkey login failed counter.`);
          }
        }

        await hPasskeyAssociation.mutate(x => {
          x.status ??= {}
          x.status.counter = verification.authenticationInfo.newCounter;
          x.status.lastSeen = new Date;
        });

        const hUser = auth.index.getEntityHandle<UserEntity>(
          "login-server.dist.app/v1alpha1", "User",
          passkey.spec.userName);
        const user = await hUser.get();
        if (!user) {
          throw new Error(`That user is not known to this server.`);
        }
        if (user.spec.lifecycle == "Inactive") {
          throw new Error(`This user is not active.`);
        }

        await auth.loginAs(ctx, user); // TODO: give passkey.metadata.name

        // const { bearerToken, expiresAt } = await storage.issueSession(ctx, user, passkey.metadata.name);

        // console.log(JSON.stringify({challenge, signin: reqJson.authn, verification, passkey},null,2));
        // console.log(`User ${user.metadata.name} signed in.`);

        return {
          serverOrigin: new URL(auth.selfBaseUrl).origin,
          userName: user.metadata.name,
          userId: user.metadata.uid,
          // bearerToken,
          // expiresAt,
        };
      },
    };
  }

}

async function issuePasskeyChallenge(
  localIndex: EntityEngine,
  ctx: AuthRequestContext,
  challenge: string,
  requestType: 'webauthn.get' | 'webauthn.create',
  timeoutMs?: number,
  userName?: string,
) {
  const hChallenge = await localIndex.insertEntity<PasskeyChallengeEntity>({
    apiVersion: 'login-server.dist.app/v1alpha1',
    kind: 'PasskeyChallenge',
    metadata: {
      name: crypto.randomUUID().split('-')[0],
    },
    spec: {
      type: requestType,
      challenge,
      userName,
    },
  });

  ctx.setCookie({
    name: 'DistAppPasskeyChallenge',
    value: hChallenge.coords.name,
    path: '/auth',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    // Expire our cookie a bit after the challenge itself times out
    // Should help make timeout symptoms more consistent
    maxAge: ((timeoutMs ?? 60000) / 1000) + 30,
  });
}

async function retrieveCookieChallenge(localIndex: EntityEngine, ctx: AuthRequestContext, requestType: 'webauthn.create' | 'webauthn.get') {
  const challengeName = ctx.cookies['DistAppPasskeyChallenge'];
  if (typeof challengeName !== 'string') return null;

  const hPasskeyChallenge = localIndex
    .getEntityHandle<PasskeyChallengeEntity>('login-server.dist.app/v1alpha1', 'PasskeyChallenge', challengeName);
  const passkeyChallenge = await hPasskeyChallenge.get();
  if (!passkeyChallenge) return null;

  if (passkeyChallenge.spec.type !== requestType) throw new Error(`BUG: challenge was of wrong type`);

  await hPasskeyChallenge.delete();
  ctx.deleteCookie('DistAppPasskeyChallenge', { path: '/auth' });
  return passkeyChallenge.spec.challenge;
}
