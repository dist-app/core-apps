import { DependencyList, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { server } from '../app.ts'
import { DdpSubscription } from '@cloudydeno/ddp/client';
import { Cursor, ObserverHandle } from '@cloudydeno/ddp/livedata/types.ts';

export function useSubscribe(name: string, args: string[] = []) {
  const [isReady, setIsReady] = useState(false);
  const subRef = useRef<DdpSubscription>(null);
  useEffect(() => {
    const sub = subRef.current = server.subscribe(name, args);
    sub.ready.then(() => {
      if (subRef.current == sub) {
        setIsReady(true);
      }
    });
    return () => sub.stop();
  }, [server]);
  return isReady;
}

export function useFind<T extends {_id: string}>(
  cursorFactory: () => Cursor<T>,
  deps: DependencyList,
) {
  const cursor = useMemo(cursorFactory, deps);

  const documents = useRef<Array<T>>([]);
  const observer = useRef<ObserverHandle<T>>(null);
  const sub = useRef<() => void>(null);

  const doObserve = useCallback(() => {
    observer.current?.stop();
    documents.current = [];
    observer.current = cursor.observe({
      added(doc) {
        documents.current = [...documents.current, doc];
        sub.current?.();
      },
      changed(newDoc, oldDoc) {
        documents.current = documents.current.map(x => x._id == oldDoc._id ? newDoc : x);
        sub.current?.();
      },
      removed(doc) {
        documents.current = documents.current.filter(x => x._id !== doc._id);
        sub.current?.();
      },
    });
  }, [cursor]);

  if (!observer.current) doObserve();
  useEffect(() => {
    if (observer.current?.cursor === cursor) return;
    console.warn('WARN: rerolling useFind()');
    doObserve();
  }, [cursor]);

  // const [observer] = useState(() => cursor.observe({
  //   addedAt: function (document: T, atIndex: number, before: T | null): void {
  //     console.warn('TODO: addedAt() not implemented.');
  //   },
  //   changedAt: function (newDocument: T, oldDocument: T, atIndex: number): void {
  //     console.warn('TODO: changedAt() not implemented.');
  //   },
  //   removedAt: function (oldDocument: T, atIndex: number): void {
  //     console.warn('TODO: removedAt() not implemented.');
  //   },
  //   movedTo: function (document: T, fromIndex: number, toIndex: number, before: T | null): void {
  //     console.warn('TODO: movedTo() not implemented.');
  //   }
  // }));

  // const viewpoint = useCallback(() => cursor.
  // const items = useSyncExternalStore(onChange => {
  //   return () => observer.stop();
  // }, () => cursor.fetch());

  // const activeList = useRef<T[]>([]);

  // cursor.observe({added(document) {

  // },})

  // const random = useState(Math.random());
  const subscribeFunc = useCallback((onStoreChange: () => void) => {
    console.log('sub started');
    sub.current = onStoreChange;
    // activeList.current = [{_id: 'hello', title: 'hi'}];
    return () => {
      console.log('sub stopped');
      observer.current?.stop();
      // activeList.current = [];
    };
  }, []);
  const listFunc = useCallback(() => {
    return documents.current;
  }, []);

  const items = useSyncExternalStore(subscribeFunc, listFunc);
  return items;
}
