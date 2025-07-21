import { AsyncLocalStorage } from 'node:async_hooks';

import { EntityEngine } from "jsr:@dist-app/stdlib@0.1.5/engine/types";
import { DdpInterface, DdpSession } from "jsr:@cloudydeno/ddp@0.1.2/server";
import { registerOtlpMethods } from "jsr:@cloudydeno/ddp@0.1.2/server/otlp";
import { RandomStream } from 'jsr:@cloudydeno/ddp@0.1.2/random';


export const DistInterface = new DdpInterface;
registerOtlpMethods(DistInterface);

export const SignedOutDistInterface = new DdpInterface();
registerOtlpMethods(SignedOutDistInterface);


export const userNameMap = new WeakMap<DdpSession, EntityEngine>();
export function getEngineOrThrow(connection: DdpSession) {
  const engine = userNameMap.get(connection);
  if (!engine) throw new Error('no engine');
  return engine;
}

export const EngineStorage = new AsyncLocalStorage<EntityEngine>();
export const RandomStorage = new AsyncLocalStorage<RandomStream|null>();

export class CollectionQuery<T> {
  constructor(
    public readonly engine: EntityEngine,
    public readonly collectionName: string,
  ) {}
  public readonly filters = new Array<(entity: T) => boolean>;
}

export const CollectionEntityApiMapping = new Map<string,{apiVersion: string, kind: string}>();
