// IndexedDB를 Promise로 쓰는 작은 도우미
const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export class KV {
  private dbp: Promise<IDBDatabase> | null = null;
  constructor(private name: string, private store = 'kv') {}

  private db() {
    this.dbp ||= new Promise((resolve, reject) => {
      const r = indexedDB.open(this.name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(this.store);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return this.dbp;
  }

  private async os(mode: IDBTransactionMode = 'readonly') {
    return (await this.db()).transaction(this.store, mode).objectStore(this.store);
  }

  async get<T>(key: string) { return req<T | undefined>((await this.os()).get(key)); }
  async put(key: string, value: unknown) { await req((await this.os('readwrite')).put(value, key)); }
  async del(key: string) { await req((await this.os('readwrite')).delete(key)); }
  async clear() { await req((await this.os('readwrite')).clear()); }
  async count() { return req((await this.os()).count()); }
}
