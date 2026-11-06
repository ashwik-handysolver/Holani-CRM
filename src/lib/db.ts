import { Call, Customer } from '../types';

// Data lives in the browser's IndexedDB (localStorage is too small for transcripts and audio).
const DB_NAME = 'callsense';
type StoreName = 'calls' | 'customers' | 'audio';

/** The original recording for a call, kept so it can be played back. */
export interface AudioRecord {
  id: string; // same as the call id
  blob: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      (['calls', 'customers', 'audio'] as StoreName[]).forEach((s) => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const table = <T,>(name: StoreName) => ({
  all: () => tx<T[]>(name, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  get: (id: string) => tx<T | undefined>(name, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>),
  put: (row: T) => tx(name, 'readwrite', (s) => s.put(row)),
  remove: (id: string) => tx(name, 'readwrite', (s) => s.delete(id)),
});

export const db = {
  calls: table<Call>('calls'),
  customers: table<Customer>('customers'),
  audio: table<AudioRecord>('audio'),
};
