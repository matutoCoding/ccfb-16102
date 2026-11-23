// IndexedDB 持久层：泛型仓库封装，所有业务档案与图片 Blob 均本地存储
import type {
  AppSettings,
  CareRecord,
  CaveZone,
  CheeseBatch,
  CheeseWheel,
  Inspection,
} from '../types'

const DB_NAME = 'cave-rind-workbench'
const DB_VERSION = 1

export const STORE = {
  zones: 'zones',
  batches: 'batches',
  wheels: 'wheels',
  records: 'records',
  inspections: 'inspections',
  settings: 'settings',
  blobs: 'blobs',
} as const

type StoreName = (typeof STORE)[keyof typeof STORE]

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      const ensure = (name: string, index?: { name: string; key: string; multi?: boolean }) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'id' })
          if (index) store.createIndex(index.name, index.key, { unique: false, multiEntry: index.multi })
        }
      }
      ensure(STORE.zones)
      ensure(STORE.batches)
      ensure(STORE.wheels, { name: 'by_batch', key: 'batchId' })
      ensure(STORE.records, { name: 'by_wheel', key: 'wheelId' })
      ensure(STORE.inspections, { name: 'by_wheel', key: 'wheelId' })
      ensure(STORE.settings)
      // Blob 单独存放：{ id, blob, mime }
      ensure(STORE.blobs)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = run(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export interface Repo<T extends { id: string }> {
  get(id: string): Promise<T | undefined>
  getAll(): Promise<T[]>
  put(entity: T): Promise<void>
  bulkPut(entities: T[]): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

function repo<T extends { id: string }>(store: StoreName): Repo<T> {
  return {
    get: (id) =>
      tx<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>),
    getAll: () => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
    put: (entity) => tx(store, 'readwrite', (s) => s.put(entity)).then(() => undefined),
    bulkPut: (entities) =>
      openDb().then(
        (db) =>
          new Promise<void>((resolve, reject) => {
            const t = db.transaction(store, 'readwrite')
            const s = t.objectStore(store)
            entities.forEach((e) => s.put(e))
            t.oncomplete = () => resolve()
            t.onerror = () => reject(t.error)
          }),
      ),
    remove: (id) => tx(store, 'readwrite', (s) => s.delete(id)).then(() => undefined),
    clear: () => tx(store, 'readwrite', (s) => s.clear()).then(() => undefined),
  }
}

export const zoneRepo = repo<CaveZone>(STORE.zones)
export const batchRepo = repo<CheeseBatch>(STORE.batches)
export const wheelRepo = repo<CheeseWheel>(STORE.wheels)
export const recordRepo = repo<CareRecord>(STORE.records)
export const inspectionRepo = repo<Inspection>(STORE.inspections)
export const settingsRepo = repo<AppSettings>(STORE.settings)

export interface StoredBlob {
  id: string
  blob: Blob
  mime: string
}

export const blobRepo = repo<StoredBlob>(STORE.blobs)

// 按索引取某轮子的全部记录
export function listByWheel<T>(store: StoreName, wheelId: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const t = db.transaction(store, 'readonly')
        const idx = t.objectStore(store).index('by_wheel')
        const req = idx.getAll(wheelId) as IDBRequest<T[]>
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}
