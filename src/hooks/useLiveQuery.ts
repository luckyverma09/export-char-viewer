import { liveQuery } from 'dexie';
import { useEffect, useState, type DependencyList } from 'react';

/** Subscribe to a Dexie live query; re-runs when the underlying tables change. */
export function useLiveQuery<T>(query: () => Promise<T> | T, deps: DependencyList, initial: T): T;
export function useLiveQuery<T>(query: () => Promise<T> | T, deps: DependencyList): T | undefined;
export function useLiveQuery<T>(query: () => Promise<T> | T, deps: DependencyList, initial?: T): T | undefined {
  const [value, setValue] = useState<T | undefined>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setValue(v),
      error: (e: unknown) => console.error('Database query failed:', (e as Error)?.name),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
