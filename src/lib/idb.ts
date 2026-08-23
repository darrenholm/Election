"use client";

/**
 * The little bit of IndexedDB this app needs.
 *
 * Two things outgrow localStorage: a photo waiting to upload, and a photo
 * attached to a half-filled door. Both are binary and both are megabytes, which
 * would blow localStorage's quota and take the queued doors down with them. The
 * API is unpleasant enough to be worth wrapping once.
 */
export function withStore<T>(
  dbName: string,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(storeName)) {
        open.result.createObjectStore(storeName);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      try {
        const request = run(db.transaction(storeName, mode).objectStore(storeName));
        request.onsuccess = () => {
          resolve(request.result);
          db.close();
        };
        request.onerror = () => {
          reject(request.error);
          db.close();
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}
