// 外皮生长模型：以「天」为步长积分温湿度与作业事件，输出某一天的 RindState
// 纯函数 + 种子驱动：同输入必得同输出，支撑预测时间轴与可复现渲染
import type {
  AppSettings,
  CareRecord,
  CaveZone,
  CheeseCategory,
  CheeseWheel,
  RindState,
} from '../types'
import { approach, clamp01, lerp, smoothstep } from './rng'

const MS_PER_DAY = 86400_000

export function dayIndex(enteredAt: string, at: Date): number {
  return Math.floor((at.getTime() - new Date(enteredAt).getTime()) / MS_PER_DAY)
}

export function dateAtDay(enteredAt: string, day: number): Date {
  return new Date(new Date(enteredAt).getTime() + day * MS_PER_DAY)
}

// 各类奶酪的菌种渐近覆盖上限：天然皮蓝斑风险高，洗浸皮橙红菌占优，白霉皮白绒占优
const ASYMPTOTE: Record<CheeseCategory, { geo: number; pen: number; mite: number; smear: number }> = {
  natural_rind: { geo: 0.45, pen: 0.62, mite: 0.5, smear: 0.12 },
  washed_rind: { geo: 0.2, pen: 0.15, mite: 0.2, smear: 0.85 },
  white_mold: { geo: 0.92, pen: 0.22, mite: 0.15, smear: 0.06 },
}

export interface ScenarioClimate {
  tempC: number
  humidity: number
}

export interface GrowthInput {
  wheel: CheeseWheel
  category: CheeseCategory
  zone: CaveZone
  records: CareRecord[]
  settings: AppSettings
  atDay: number
  // 推演场景：给出后全程用该恒定温湿度，用于「改了窖温会怎样」对比
  scenario?: ScenarioClimate
}

interface TimedEvent {
  day: number
  record: CareRecord
}

interface SimState {
  geo: number
  pen: number
  mite: number
  smear: number
  browning: number
  dryness: number
  cracking: number
  oil: number
  contactWet: number
  contactSign: number // 贴架面在本地坐标的方向：-1 = -Y，翻面后翻转
  brushRecovery: number
  lastBrushDay: number
  lastTurnDay: number
}

// 取某天的窖区温湿度：优先实测采样的线性插值，缺失时回退窖区目标值
export function climateAt(zone: CaveZone, day: number, enteredAt: string): { tempC: number; humidity: number } {
  const samples = zone.climate
  if (samples.length === 0) {
    return { tempC: zone.targetTempC, humidity: zone.targetHumidity }
  }
  const sorted = [...samples].sort((a, b) => a.at.localeCompare(b.at))
  const target = new Date(enteredAt).getTime() + (day + 0.5) * MS_PER_DAY
  let prev = sorted[0]
  let next = sorted[sorted.length - 1]
  for (let i = 0; i < sorted.length - 1; i++) {
    const t0 = new Date(sorted[i].at).getTime()
    const t1 = new Date(sorted[i + 1].at).getTime()
    if (t0 <= target && target <= t1) {
      prev = sorted[i]
      next = sorted[i + 1]
      break
    }
  }
  const t0 = new Date(prev.at).getTime()
  const t1 = new Date(next.at).getTime()
  const k = t1 === t0 ? 0 : clamp01((target - t0) / (t1 - t0))
  return {
    tempC: lerp(prev.tempC, next.tempC, k),
    humidity: lerp(prev.humidity, next.humidity, k),
  }
}

// 温度响应：12°C 附近最适，过低停滞、过高受抑
function tempFactor(tempC: number): number {
  const rise = smoothstep(2, 10, tempC)
  const fall = 1 - smoothstep(17, 24, tempC)
  return clamp01(rise * fall + 0.08)
}

function humidityFactor(humidity: number, love: number): number {
  return smoothstep(0.55, love, humidity)
}

export function simulateRind(input: GrowthInput): RindState {
  const { wheel, category, zone, records, settings, atDay, scenario } = input
  const targetDay = Math.max(0, atDay)
  const p = settings.mold
  const asym = ASYMPTOTE[category]

  const state: SimState = {
    // 入窖时带微量起始菌，菌落点从第一天就可见但极小
    geo: 0.03,
    pen: 0.01,
    mite: 0,
    smear: category === 'washed_rind' ? 0.08 : 0.02,
    browning: 0,
    dryness: 0,
    cracking: 0,
    oil: 0,
    contactWet: 0,
    contactSign: -1,
    brushRecovery: 1,
    lastBrushDay: -1,
    lastTurnDay: 0,
  }

  // 作业事件按天索引，模拟到当天时触发
  const events = new Map<number, CareRecord[]>()
  const timed: TimedEvent[] = records.map((record) => ({
    day: dayIndex(wheel.enteredAt, new Date(record.at)),
    record,
  }))
  for (const ev of timed) {
    if (ev.day < 0 || ev.day > targetDay) continue
    const list = events.get(ev.day)
    if (list) list.push(ev.record)
    else events.set(ev.day, [ev.record])
  }

  for (let day = 1; day <= targetDay; day++) {
    const climate = scenario ?? climateAt(zone, day, wheel.enteredAt)
    const tf = tempFactor(climate.tempC)
    const hfGeo = humidityFactor(climate.humidity, p.geotrichum.humidityLove)
    const hfPen = humidityFactor(climate.humidity, p.penicillium.humidityLove)
    const hfMite = humidityFactor(climate.humidity, p.mite.humidityLove)
    const hfSmear = humidityFactor(climate.humidity, p.smear.humidityLove)
    // 油膜抑制好氧霉
    const oilSupp = 1 - state.oil * 0.7

    const grow = (cov: number, rate: number, hf: number, ceiling: number) =>
      cov + rate * hf * tf * oilSupp * (1 - cov / Math.max(ceiling, 0.001))

    state.geo = clamp01(grow(state.geo, p.geotrichum.growthRate, hfGeo, asym.geo))
    state.pen = clamp01(grow(state.pen, p.penicillium.growthRate, hfPen, asym.pen))
    state.smear = clamp01(grow(state.smear, p.smear.growthRate, hfSmear, asym.smear))

    // 螨虫：久不刷皮才成灾
    const neglect = smoothstep(settings.neglectTurnDays, settings.neglectTurnDays * 2.2, day - state.lastTurnDay)
    state.mite = clamp01(grow(state.mite, p.mite.growthRate * (0.35 + neglect), hfMite, asym.mite))

    // 褐变：随时间单调推进，温度高走得快
    state.browning = clamp01(state.browning + 0.0016 * (0.45 + 0.55 * tf))

    // 干燥与裂纹：湿度低于阈值才累积
    const dryTarget = 1 - smoothstep(
      p.crack.humidityThreshold - 0.18,
      p.crack.humidityThreshold,
      climate.humidity,
    )
    state.dryness = approach(state.dryness, dryTarget, 0.06, 1)
    state.cracking = state.dryness * smoothstep(0.12, 0.55, state.browning) * p.crack.density

    // 油膜自然衰减（约 35 天耗尽）
    state.oil = approach(state.oil, 0, 1 / 35, 1)
    // 刷皮绒毛恢复
    state.brushRecovery = approach(state.brushRecovery, 1, 1 / Math.max(1, settings.brushRecoverDays), 1)

    // 久不翻面：贴架面闷出压痕湿斑
    const sinceTurn = day - state.lastTurnDay
    if (sinceTurn > settings.neglectTurnDays) {
      state.contactWet = approach(state.contactWet, 0.75, 0.09, 1)
    }

    for (const ev of events.get(day) ?? []) {
      applyEvent(ev, day, state, settings)
    }
  }

  return {
    day: targetDay,
    geotrichum: state.geo * p.geotrichum.strength,
    penicillium: state.pen * p.penicillium.strength,
    mite: state.mite * p.mite.strength,
    smear: state.smear * p.smear.strength,
    browning: state.browning,
    dryness: state.dryness,
    cracking: clamp01(state.cracking),
    oil: state.oil,
    contactWet: state.contactWet,
    brushRecovery: state.brushRecovery,
    lastBrushDay: state.lastBrushDay,
    lastTurnDay: state.lastTurnDay,
    scenario: scenario ? 'scenario' : 'actual',
  }
}

function applyEvent(ev: CareRecord, day: number, s: SimState, settings: AppSettings): void {
  const k = ev.intensity
  switch (ev.action) {
    case 'brush': {
      // 绒毛刷倒刷掉、霉斑变淡，按力度保留残余
      const keep = lerp(1, settings.brushRemnant, k)
      s.geo *= keep
      s.pen *= keep
      s.mite *= keep
      s.smear *= lerp(1, 0.75, k)
      s.brushRecovery = 0
      s.lastBrushDay = day
      return
    }
    case 'turn': {
      // 翻面：湿压面释放，接触方向翻转
      s.contactWet = Math.max(0, s.contactWet - 0.8)
      s.contactSign *= -1
      s.lastTurnDay = day
      return
    }
    case 'oil': {
      s.oil = Math.max(s.oil, 0.4 + 0.5 * k)
      return
    }
    case 'brine_wash': {
      // 盐水压制好氧霉，助长洗浸皮橙红菌面
      s.geo *= 1 - 0.3 * k
      s.pen *= 1 - 0.45 * k
      s.mite *= 1 - 0.4 * k
      s.smear = clamp01(s.smear + 0.12 * k)
      return
    }
  }
}
