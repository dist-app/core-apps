import { RandomStream } from "jsr:@cloudydeno/ddp@0.1.2/random";
import { EntityHandle, ApiKindEntity } from "jsr:@dist-app/stdlib@0.1.5/engine/types";
import { CollectionEntityApiMapping, CollectionQuery, EngineStorage, RandomStorage } from "../registry.ts";
import sift from "https://esm.sh/sift@17.1.3";

export const Mongo = {
  Collection: class MongoCollection {
    constructor(
      private readonly collectionName: string,
    ) {}

    find(
      filter: Record<string,unknown>,
      // TODO: projection, sort, etc
      ...args: unknown[]
    ) {
      console.log(`find`, this.collectionName, [filter, ...args]);
      const engine = EngineStorage.getStore();
      if (!engine) throw new Error(`No EntityEngine found in async context`);

      const query = new CollectionQuery(engine, this.collectionName);
      if (filter) query.filters.push(sift(filter));
      return query;
    }

    async findOneAsync(
      filter: {_id?: string} & Record<string,unknown>,
      // TODO: projection, sort, etc
      ...args: unknown[]
    ) {
      const engine = EngineStorage.getStore();
      if (!engine) throw new Error(`No EntityEngine found in async context`);

      const apiCoords = CollectionEntityApiMapping.get(this.collectionName);
      if (!apiCoords) throw new Error(`Unknown collection "${this.collectionName}"`);

      if (typeof filter?._id == 'string') {
        const entity = await engine.getEntity<ApiKindEntity>(
          apiCoords.apiVersion,
          apiCoords.kind,
          filter._id);
        if (!entity) return null;
        const doc = {
          ...(entity.spec as Record<string,unknown>),
          _id: entity.metadata.name,
        };
        // Check that the document matches any other fields too
        if (!sift(filter)(doc)) return null;
        return doc;
      } else {
        throw new Error(`TODO: find by filter`);
      }
    }

    async updateAsync(
      filter: {_id?: string} & Record<string,unknown>,
      operations: Record<string,unknown>,
    ) {
      const engine = EngineStorage.getStore();
      if (!engine) throw new Error(`No EntityEngine found in async context`);

      const apiCoords = CollectionEntityApiMapping.get(this.collectionName);
      if (!apiCoords) throw new Error(`Unknown collection "${this.collectionName}"`);

      let handle: EntityHandle<ApiKindEntity> | null = null;
      if (typeof filter?._id == 'string') {
        handle = engine.getEntityHandle<ApiKindEntity>(
          apiCoords.apiVersion,
          apiCoords.kind,
          filter._id);
      } else {
        throw new Error(`TODO: find by filter`);
      }

      // const entity = await handle.get();
      // if (!entity) return null;
      // const doc = {
      //   ...(entity.spec as Record<string,unknown>),
      //   _id: entity.metadata.name,
      // };

      // // Check that the document matches any other fields too
      // if (!sift(filter)(doc)) return null;

      let updatedCount = 0;
      await handle.mutate(entity => {
        const spec = entity.spec as Record<string,unknown>;
        const doc = {
          ...spec,
          _id: entity.metadata.name,
        };

        // Check that the document matches any other fields too
        if (!sift(filter)(doc)) return Symbol.for('no-op');

        console.log(`update`, this.collectionName, doc, operations);

        for (const [opName, opData] of Object.entries(operations)) {
          switch (opName) {
            case '$set': {
              for (const [key, value] of Object.entries(opData as Record<string,unknown>)) {
                if (key.includes('.')) throw new Error(`TODO: nested update key "${key}"`);
                spec[key] = value;
              }
              break;
            };
            default: throw new Error(`TODO: unhandled update op "${opName}"`);
          }
        }

        updatedCount++;
      });

      return updatedCount;
    }

    async insertAsync(doc: {_id?: string} & Record<string,unknown>) {
      const engine = EngineStorage.getStore();
      if (!engine) throw new Error(`No EntityEngine found in async context`);

      const {_id, userId, ...spec} = doc;
      const random = RandomStorage.getStore() ?? new RandomStream(`${Math.random()}`);
      const name = _id ?? random.getStream(`/collection/${this.collectionName}`).id();
      console.log(`insert`, this.collectionName, name, doc);

      const apiCoords = CollectionEntityApiMapping.get(this.collectionName);
      if (!apiCoords) throw new Error(`Unknown collection "${this.collectionName}"`);
      await engine.insertEntity<ApiKindEntity>({
        apiVersion: apiCoords.apiVersion,
        kind: apiCoords.kind,
        metadata: { name },
        spec,
      });
      return name;
    }
  }
}
