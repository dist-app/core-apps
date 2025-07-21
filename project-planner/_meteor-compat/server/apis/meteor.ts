import { type ApiKindEntity } from "jsr:@dist-app/stdlib@0.1.5/engine/types";
import { emitToSub, renderEventStream, filterEventStream } from "jsr:@dist-app/stdlib@0.1.5/ddp/server/livedata";
import { type ServerSentPacket, type DocumentFields } from "jsr:@dist-app/stdlib@0.1.5/ddp/types";

import { DistInterface, getEngineOrThrow, EngineStorage, CollectionQuery, CollectionEntityApiMapping, RandomStorage } from "../registry.ts";

export const Meteor = {

  Error: class MeteorError extends Error {
    constructor(public readonly code: string, public override readonly message: string) {
      super(`${message} [${code}]`);
    }
  },

  methods(methodMap: Record<string, (...args: unknown[]) => unknown>) {
    for (const [name, handler] of Object.entries(methodMap)) {
      DistInterface.addMethod(name, async (socket, params, random) => {

        const engine = getEngineOrThrow(socket);
        const result = await EngineStorage.run(engine, () =>
          RandomStorage.run(random, () => handler.apply(null, params)));
        console.log('method', name, 'result:', result);
        return result;
        // const choresApi = new ChoreListApi(engine);
      });
    }
  },
  publish(name: string, handler: (...args: unknown[]) => unknown) {
    // console.log(`TODO: Meteor.publish`, args);
    DistInterface.addPublication(name, async (sub, params) => {
      const engine = getEngineOrThrow(sub.connection);
      const result = await EngineStorage.run(engine, () => handler.apply(null, params));
      // console.log('publish', name, 'result:', result);

      const items = Array.isArray(result) ? result : result ? [result] : [];
      // async function publishItem(item: CollectionQuery<unknown>) {
      const outStreams = new Array<ReadableStream<SubscriptionEvent>>;
      for (const item of items) {
        if (item instanceof CollectionQuery) {
          const apiCoords = CollectionEntityApiMapping.get(item.collectionName);
          if (!apiCoords) throw new Error(`Unknown collection "${item.collectionName}"`);
          const stream = item.engine.observeEntities<ApiKindEntity>(
            apiCoords.apiVersion,
            apiCoords.kind,
            { signal: sub.signal });
          outStreams.push(
            renderEventStream(
              filterEventStream(stream, entity => item.filters.every(filter => filter({
                ...(entity.spec as Record<string,unknown>),
                _id: entity.metadata.name,
              }))),
              item.collectionName,
              x => x.metadata.name,
              x => x.spec as DocumentFields));
          continue;
        }
        throw new Error(`published weird thing`);
      }

      if (outStreams.length == 0) {
        // Publishing nothing, e.g. immediately ready
        sub.ready();
      } else {
        emitToSub(sub, outStreams);
      }
    });

  },
}

// TODO: replace with exports from /ddp/server/livedata
type SubscriptionEvent =
| (ServerSentPacket & {msg: 'added' | 'changed' | 'removed'})
| {msg: 'ready'}
| {msg: 'nosub', error?: Error}
;
