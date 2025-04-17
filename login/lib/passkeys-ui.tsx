/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment } from "https://deno.land/x/htm@0.2.1/mod.ts";

import aaguids from "https://raw.githubusercontent.com/passkeydeveloper/passkey-authenticator-aaguids/32c75cd28e2301fbc15cf9aa08da8ab3acb5a670/aaguid.json" with { type: "json" };

import type { PasskeyAssociationEntity, UserEntity } from 'https://uber.danopia.net/dist-app-deno/52605ca9fa7d2f5d0a26961f29f1d864c9966352/apis/login-server/entities.ts';
import type { AuthRequestContext, AuthSystem, SettingsTab } from "https://uber.danopia.net/dist-app-deno/52605ca9fa7d2f5d0a26961f29f1d864c9966352/lib/auth/types.ts";

export const PasskeysTab: SettingsTab = {
  slug: 'passkeys',
  label: 'passkeys',
  sortIdx: 40,
  eligable(auth: AuthSystem, ctx: AuthRequestContext, user: UserEntity) {
    if (user.spec.foreignIdentity) return false;
    if (!user.spec.profile.contactEmail) return false;
    return true;
  },
  async render(auth: AuthSystem, ctx: AuthRequestContext, user: UserEntity) {

    // TODO: scalability
    const allPasskeys = await auth.index
      .listEntities<PasskeyAssociationEntity>(
        'login-server.dist.app/v1alpha1', 'PasskeyAssociation')
      .then(x => x
        .filter(y => y.spec.userName == user.metadata.name));

    return (<>
      <h2>your trusted passkeys</h2>
      <ul style="list-style: none; padding: 0.5em 1.3em; margin: 0;">
        {allPasskeys.map(x => {
          const aaguid = (aaguids as unknown as Record<string,{name: string; icon_dark: string; icon_light: string}>)[x.spec.aaguid];
          return (
            <li style="display: flex; background-color: #e8e8e8; margin: 1em 0; align-items: center; gap: 1em;">
              <div style="background-color: #ddd; display: flex; width: 4em; height: 4em; align-items: center; justify-content: center;">
                <img src={aaguid?.icon_light ?? defaultIcon} style="width: 3em;" />
              </div>
              <div style="flex: 1; text-align: left;">
                <div style="margin-bottom: 0.4em;">
                  {aaguid?.name ?? 'Generic passkey'}
                  {x.spec.credential.backedUp ? (
                    <span style="border: 1px solid gray; background-color: #ccf; border-radius: 15px; font-size: 0.8em; padding: 0.2em 0.5em; margin: 0 0.5em;" title="This passkey is eligable for backup by its provider.">
                      Synced
                    </span>
                  ) : []}
                  {/* {x.metadata.name == userSession.spec.passkeyAssociationName ? (
                    <span style="border: 1px solid gray; background-color: #cfc; border-radius: 15px; font-size: 0.8em; padding: 0.2em 0.5em; margin: 0 0.5em;">
                      Current Session
                    </span>
                    ) : []} */}
                </div>
                <div style="font-size: 0.7em; color: rgba(0,0,0,0.7);">
                  <span>Added on {x.metadata.creationTimestamp?.toLocaleDateString([])}</span>
                  <span style="margin: 0 1em; color: rgba(0,0,0,0.3);">|</span>
                  <span>Last seen {x.status?.lastSeen ? `on ${x.status?.lastSeen?.toLocaleDateString([])}` : 'never'}</span>
                </div>
              </div>
              {x.metadata.name !== null/*userSession.spec.passkeyAssociationName*/ ? (
                <button class="delete-passkey" data-passkey={x.metadata.name} type="button"
                    style="align-self: stretch; padding: 0.2em 0.5em; margin: 0;">
                  🗑️
                </button>
              ) : []}
            </li>
          );
        })}
        {allPasskeys.length == 0 ? (
          <li>none yet. create your first passkey today!</li>
        ) : []}
        <li style="display: flex; margin: 1em 0;">
          <button id="add-passkey" type="button"
              style="flex: 1; align-self: stretch; margin: 0;">
            add a passkey
          </button>
        </li>
      </ul>
    </>);
  }
};

// https://github.com/passkeydeveloper/passkey-authenticator-aaguids/blob/main/aaguid.json

// this is from github octicons
const defaultIcon = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMjQiIGFyaWEtaGlkZGVuPSJ0cnVlIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHZlcnNpb249IjEuMSIgd2lkdGg9IjI0Ij48cGF0aCBmaWxsPSIjNDQ0IiBkPSJNOS40OTYgMmE1LjI1IDUuMjUgMCAwIDAtMi41MTkgOS44NTdBOS4wMDYgOS4wMDYgMCAwIDAgLjUgMjAuMjI4YS43NTEuNzUxIDAgMCAwIC43MjguNzcyaDUuMjU3YzMuMzM4LjAwMSA2LjY3Ny4wMDIgMTAuMDE1IDBhLjUuNSAwIDAgMCAuNS0uNXYtNC42NjlhLjk1Ljk1IDAgMCAwLS4xNzEtLjU1MSA5LjAyIDkuMDIgMCAwIDAtNC44MTQtMy40MjNBNS4yNSA1LjI1IDAgMCAwIDkuNDk2IDJaIj48L3BhdGg+PHBhdGggZmlsbD0iIzQ0NCIgZD0iTTIzLjYyNSAxMC4zMTNjMCAxLjMxLS42NzIgMi40NjQtMS42OTEgMy4xMzRhLjM5OC4zOTggMCAwIDAtLjE4NC4zM3YuODg2YS4zNzIuMzcyIDAgMCAxLS4xMS4yNjVsLS41MzQuNTM0YS4xODguMTg4IDAgMCAwIDAgLjI2NWwuNTM0LjUzNGMuMDcxLjA3LjExLjE2Ni4xMS4yNjV2LjM0N2EuMzc0LjM3NCAwIDAgMS0uMTEuMjY1bC0uNTM0LjUzNGEuMTg4LjE4OCAwIDAgMCAwIC4yNjVsLjUzNC41MzRhLjM3LjM3IDAgMCAxIC4xMS4yNjV2LjQzMWEuMzc5LjM3OSAwIDAgMS0uMDk3LjI1M2wtMS4yIDEuMzE5YS43ODEuNzgxIDAgMCAxLTEuMTU2IDBsLTEuMi0xLjMxOWEuMzc5LjM3OSAwIDAgMS0uMDk3LS4yNTN2LTUuMzlhLjM5OC4zOTggMCAwIDAtLjE4NC0uMzMgMy43NSAzLjc1IDAgMSAxIDUuODA5LTMuMTM0Wk0yMSA5Ljc1YTEuMTI1IDEuMTI1IDAgMSAwLTIuMjUgMCAxLjEyNSAxLjEyNSAwIDAgMCAyLjI1IDBaIj48L3BhdGg+PC9zdmc+`;
