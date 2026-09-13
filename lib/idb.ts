/**
 * IndexedDB 的极简 Promise 封装。
 *
 * 不引入第三方依赖：只需要 open / get / getAll / put / delete / clear 与事务完成回调，
 * 用原生 API 实现约 100 行即可，且完全可控。
 *
 * 注意：所有函数在服务端（无 indexedDB）都应安全失败，由调用方保证只在客户端调用。
 */

/**
 * 数据库名沿用项目早期的 `crac-practice`，**不要因为项目改名而修改**：
 * 改名会让所有已有用户的练习进度（错题本、断点、成绩历史）全部失效，
 * 而这个名字不会出现在任何用户可见的界面或 URL 上。
 * localStorage 的 `crac-practice:theme` 键同理（见 lib/theme-script.ts）。
 */
export const DB_NAME = "crac-practice";
export const DB_VERSION = 2;

export const STORES = {
  /** 每题累计状态：错题、收藏、正确率 */
  stats: "stats",
  /** 作答流水 */
  attempts: "attempts",
  /** 顺序练习断点 */
  seq: "seq",
  /** 考试会话 */
  exams: "exams",
  /** 考试成绩历史 */
  results: "results",
  /** 设置 */
  settings: "settings",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDB()) {
    return Promise.reject(new Error("当前环境不支持 IndexedDB"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!db.objectStoreNames.contains(STORES.stats)) {
        const store = db.createObjectStore(STORES.stats, { keyPath: "key" });
        store.createIndex("bank", "bank");
        store.createIndex("starred", "starred");
      }
      if (!db.objectStoreNames.contains(STORES.attempts)) {
        const store = db.createObjectStore(STORES.attempts, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("at", "at");
        store.createIndex("key", "key");
        store.createIndex("outcome", "outcome");
      }
      if (!db.objectStoreNames.contains(STORES.seq)) {
        db.createObjectStore(STORES.seq, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.exams)) {
        db.createObjectStore(STORES.exams, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.results)) {
        const store = db.createObjectStore(STORES.results, { keyPath: "id" });
        store.createIndex("finishedAt", "finishedAt");
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "id" });
      }
      void tx;
    };

    request.onsuccess = () => {
      const db = request.result;
      // 同一标签页内被其它上下文要求升级时，先关掉旧连接避免阻塞
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onblocked = () =>
      reject(new Error("数据库被其它标签页占用，请关闭其它页面后重试"));
    request.onerror = () => reject(request.error ?? new Error("打开数据库失败"));
  });

  return dbPromise;
}

function runRequest<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = fn(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error ?? new Error("事务被中止"));
      }),
  );
}

export function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return runRequest<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
}

export function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return runRequest<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
}

export function idbPut<T>(store: StoreName, value: T): Promise<IDBValidKey> {
  return runRequest<IDBValidKey>(store, "readwrite", (s) => s.put(value as unknown as object));
}

export function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  return runRequest<undefined>(store, "readwrite", (s) => s.delete(key) as IDBRequest<undefined>);
}

export function idbClear(store: StoreName): Promise<void> {
  return runRequest<undefined>(store, "readwrite", (s) => s.clear() as IDBRequest<undefined>);
}

/** 批量写入（单事务，比逐条 put 快得多） */
export function idbPutMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return Promise.resolve();
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const os = tx.objectStore(store);
        for (const v of values) os.put(v as unknown as object);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("事务被中止"));
      }),
  );
}

export function isStorageAvailable(): boolean {
  return hasIndexedDB();
}
