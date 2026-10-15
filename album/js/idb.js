// IndexedDB(휴대폰 안 저장소)를 Promise로 쉽게 쓰기 위한 작은 도우미

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export function openDB(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, version);
    r.onupgradeneeded = (e) => upgrade(r.result, e.oldVersion, r.transaction);
    r.onsuccess = () => resolve(new DB(r.result));
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('저장소가 다른 창에서 사용 중이에요. 다른 창을 닫고 다시 열어 주세요.'));
  });
}

class DB {
  constructor(db) { this.db = db; }

  store(name, mode = 'readonly') {
    return this.db.transaction(name, mode).objectStore(name);
  }

  get(store, key) { return req(this.store(store).get(key)); }
  all(store) { return req(this.store(store).getAll()); }
  allBy(store, index, query) { return req(this.store(store).index(index).getAll(query)); }
  keys(store) { return req(this.store(store).getAllKeys()); }
  put(store, value, key) { return req(this.store(store, 'readwrite').put(value, key)); }
  del(store, key) { return req(this.store(store, 'readwrite').delete(key)); }
  clear(store) { return req(this.store(store, 'readwrite').clear()); }
  count(store) { return req(this.store(store).count()); }

  // 여러 저장소를 한 번에 바꾸기
  tx(stores, fn) {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(stores, 'readwrite');
      let result;
      Promise.resolve(fn((n) => t.objectStore(n))).then((r) => { result = r; }, reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
}
