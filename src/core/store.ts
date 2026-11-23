// 应用中枢：内存缓存 + IndexedDB 持久化 + 生长模型调度
import type {
  AppSettings,
  CareRecord,
  CaveZone,
  CheeseBatch,
  CheeseWheel,
  Inspection,
  RindState,
} from '../types'
import {
  batchRepo,
  inspectionRepo,
  recordRepo,
  settingsRepo,
  wheelRepo,
  zoneRepo,
} from './db'
import { defaultSettings } from './defaults'
import { simulateRind, type ScenarioClimate } from './growth'
import { generateSeedData } from './seed'
import { dayIndex } from './growth'

class AppStore {
  zones: CaveZone[] = []
  batches: CheeseBatch[] = []
  wheels: CheeseWheel[] = []
  records: CareRecord[] = []
  inspections: Inspection[] = []
  settings: AppSettings = defaultSettings()
  // 当前查看的日期（默认今天），拖时间轴即改这里
  viewDate = new Date()
  private stateCache = new Map<string, RindState>()

  async ensureLoaded(): Promise<void> {
    const existing = await wheelRepo.getAll()
    if (existing.length === 0) {
      await this.resetToSeed()
      return
    }
    await this.loadAll()
  }

  private async loadAll(): Promise<void> {
    const [zones, batches, wheels, records, inspections, settingsList] = await Promise.all([
      zoneRepo.getAll(),
      batchRepo.getAll(),
      wheelRepo.getAll(),
      recordRepo.getAll(),
      inspectionRepo.getAll(),
      settingsRepo.getAll(),
    ])
    this.zones = zones
    this.batches = batches
    this.wheels = wheels
    this.records = records
    this.inspections = inspections
    this.settings = settingsList[0] ?? defaultSettings()
    this.stateCache.clear()
  }

  async resetToSeed(): Promise<void> {
    const seed = generateSeedData()
    await Promise.all([
      zoneRepo.bulkPut(seed.zones),
      batchRepo.bulkPut(seed.batches),
      wheelRepo.bulkPut(seed.wheels),
      recordRepo.bulkPut(seed.records),
      inspectionRepo.bulkPut(seed.inspections),
    ])
    await settingsRepo.put(defaultSettings())
    await this.loadAll()
  }

  async saveSettings(next: AppSettings): Promise<void> {
    next.updatedAt = new Date().toISOString()
    this.settings = next
    await settingsRepo.put(next)
    // 参数变了，所有生长结果作废重算
    this.stateCache.clear()
  }

  async addZone(zone: CaveZone): Promise<void> {
    this.zones.push(zone)
    await zoneRepo.put(zone)
  }

  async updateZone(zone: CaveZone): Promise<void> {
    this.zones = this.zones.map((z) => (z.id === zone.id ? zone : z))
    await zoneRepo.put(zone)
  }

  async addWheel(wheel: CheeseWheel): Promise<void> {
    this.wheels.push(wheel)
    await wheelRepo.put(wheel)
    this.stateCache.delete(wheel.id)
  }

  async updateWheel(wheel: CheeseWheel): Promise<void> {
    this.wheels = this.wheels.map((w) => (w.id === wheel.id ? wheel : w))
    await wheelRepo.put(wheel)
    this.stateCache.delete(wheel.id)
  }

  async addRecord(record: CareRecord): Promise<void> {
    this.records.push(record)
    await recordRepo.put(record)
    this.stateCache.delete(record.wheelId)
  }

  async addInspection(inspection: Inspection): Promise<void> {
    this.inspections.push(inspection)
    await inspectionRepo.put(inspection)
  }

  async updateInspection(inspection: Inspection): Promise<void> {
    this.inspections = this.inspections.map((i) => (i.id === inspection.id ? inspection : i))
    await inspectionRepo.put(inspection)
  }

  zoneOf(wheel: CheeseWheel): CaveZone | undefined {
    return this.zones.find((z) => z.id === wheel.zoneId)
  }

  categoryOf(wheel: CheeseWheel) {
    return this.batches.find((b) => b.id === wheel.batchId)?.category ?? 'natural_rind'
  }

  recordsOf(wheelId: string): CareRecord[] {
    return this.records
      .filter((r) => r.wheelId === wheelId)
      .sort((a, b) => a.at.localeCompare(b.at))
  }

  inspectionsOf(wheelId: string): Inspection[] {
    return this.inspections
      .filter((i) => i.wheelId === wheelId)
      .sort((a, b) => b.at.localeCompare(a.at))
  }

  // 某轮在查看日期的真实生长状态（带缓存）
  rindState(wheel: CheeseWheel, at: Date = this.viewDate): RindState {
    const key = `${wheel.id}@${at.toISOString().slice(0, 10)}`
    const cached = this.stateCache.get(key)
    if (cached) return cached
    const zone = this.zoneOf(wheel)
    if (!zone) throw new Error(`轮子 ${wheel.label} 缺少窖区档案`)
    const state = simulateRind({
      wheel,
      category: this.categoryOf(wheel),
      zone,
      records: this.recordsOf(wheel.id),
      settings: this.settings,
      atDay: dayIndex(wheel.enteredAt, at),
    })
    this.stateCache.set(key, state)
    return state
  }

  // 预测场景：用假设温湿度向未来推演，不改档案
  scenarioState(wheel: CheeseWheel, at: Date, scenario: ScenarioClimate): RindState {
    const zone = this.zoneOf(wheel)
    if (!zone) throw new Error(`轮子 ${wheel.label} 缺少窖区档案`)
    return simulateRind({
      wheel,
      category: this.categoryOf(wheel),
      zone,
      records: this.recordsOf(wheel.id),
      settings: this.settings,
      atDay: dayIndex(wheel.enteredAt, at),
      scenario,
    })
  }

  // 整层所有轮子的状态（架视图用）
  allStates(at: Date = this.viewDate): Map<string, RindState> {
    const map = new Map<string, RindState>()
    for (const wheel of this.wheels) map.set(wheel.id, this.rindState(wheel, at))
    return map
  }
}

export const appStore = new AppStore()
