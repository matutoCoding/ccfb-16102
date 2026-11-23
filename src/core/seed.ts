// 测试数据：种子化生成窖区、批次、轮子、温湿度、翻刷记录与巡检
// 刻意埋入漏翻漏刷的问题轮，复现蓝斑/发黏/压痕场景
import type {
  CareRecord,
  CaveZone,
  CheeseBatch,
  CheeseCategory,
  CheeseWheel,
  ClimateSample,
  Inspection,
} from '../types'
import { hashString, mulberry32, uid } from './rng'

const NOW = new Date('2026-11-24T09:00:00')
const DAY = 86400_000

function iso(offsetDays: number, hour = 9): string {
  return new Date(NOW.getTime() - offsetDays * DAY + hour * 3600_000).toISOString()
}

interface ZoneSpec {
  name: string
  temp: number
  humidity: number
  shelves: number
  levels: number
  perLevel: number
}

const ZONE_SPECS: ZoneSpec[] = [
  { name: 'A区·主洞厅', temp: 11.5, humidity: 0.9, shelves: 2, levels: 3, perLevel: 6 },
  { name: 'B区·北支洞', temp: 10.2, humidity: 0.86, shelves: 2, levels: 3, perLevel: 6 },
  { name: 'C区·高湿间', temp: 12.6, humidity: 0.95, shelves: 1, levels: 2, perLevel: 6 },
]

export interface SeedResult {
  zones: CaveZone[]
  batches: CheeseBatch[]
  wheels: CheeseWheel[]
  records: CareRecord[]
  inspections: Inspection[]
}

export function generateSeedData(): SeedResult {
  const rand = mulberry32(hashString('cave-rind-seed-v1'))
  const zones: CaveZone[] = []
  const batches: CheeseBatch[] = []
  const wheels: CheeseWheel[] = []
  const records: CareRecord[] = []
  const inspections: Inspection[] = []

  const categories: CheeseCategory[] = ['natural_rind', 'washed_rind', 'white_mold']
  const makers = ['阿尔卑斯合作社', '本地山地牧场', '庄园奶酪坊']

  // 6 个批次，三类各 2
  for (let b = 0; b < 6; b++) {
    const category = categories[b % 3]
    const ageDays = [420, 300, 210, 150, 90, 35][b]
    batches.push({
      id: `batch_${b + 1}`,
      code: `B-2026-${String(14 + b).padStart(3, '0')}`,
      category,
      maker: makers[b % makers.length],
      milk: ['生牛乳', '山羊奶', '绵羊奶'][b % 3],
      createdAt: iso(ageDays),
    })
  }

  let wheelSeq = 0
  // 每个批次内部独立递增编号，避免同批次轮编号撞号
  const batchCounter = new Map<string, number>()
  for (let zi = 0; zi < ZONE_SPECS.length; zi++) {
    const spec = ZONE_SPECS[zi]
    const zoneId = `zone_${zi + 1}`
    const slots: CaveZone['slots'] = []
    const width = spec.shelves * 2.2 + 1.2
    const depth = 2.6

    let slotIndex = 0
    for (let sh = 0; sh < spec.shelves; sh++) {
      const shelfCode = `${String.fromCharCode(65 + zi)}${sh + 1}`
      for (let lv = 0; lv < spec.levels; lv++) {
        for (let pos = 0; pos < spec.perLevel; pos++) {
          const code = `${shelfCode}-L${lv + 1}-${String(pos + 1).padStart(2, '0')}`
          slots.push({
            id: `slot_${zoneId}_${slotIndex++}`,
            code,
            shelf: shelfCode,
            level: lv + 1,
            position: pos + 1,
            x: (pos - (spec.perLevel - 1) / 2) * 0.34 + (sh - (spec.shelves - 1) / 2) * 0.4,
            y: 0.35 + lv * 0.55,
            z: (sh - (spec.shelves - 1) / 2) * 1.1,
          })
        }
      }
    }

    // 每 3 天一条温湿度，带缓慢漂移与噪声
    const climate: ClimateSample[] = []
    for (let d = 420; d >= 0; d -= 3) {
      const drift = Math.sin(d / 28) * 0.8
      climate.push({
        id: uid('climate'),
        at: iso(d, 8),
        tempC: +(spec.temp + drift + (rand() - 0.5) * 0.5).toFixed(2),
        humidity: Math.min(0.99, Math.max(0.6, spec.humidity + (rand() - 0.5) * 0.06)),
      })
    }

    zones.push({
      id: zoneId,
      name: spec.name,
      width,
      depth,
      height: 2.4,
      targetTempC: spec.temp,
      targetHumidity: spec.humidity,
      vents: [
        { id: uid('vent'), name: '主通风口', x: width / 2 - 0.2, y: 2.1, z: -depth / 2 + 0.1 },
        { id: uid('vent'), name: '回风孔', x: -width / 2 + 0.2, y: 1.7, z: depth / 2 - 0.1 },
      ],
      slots,
      climate,
      createdAt: iso(430),
    })

    // 每个区放 12 个轮，跨批次分布
    const zoneSlots = slots
    for (let w = 0; w < 12; w++) {
      const batch = batches[wheelSeq % batches.length]
      const ageDays = Math.round((NOW.getTime() - new Date(batch.createdAt).getTime()) / DAY)
      const diameter = +(0.28 + rand() * 0.12).toFixed(3)
      const height = +(diameter * (0.32 + rand() * 0.1)).toFixed(3)
      const wheelId = `wheel_${wheelSeq + 1}`
      const batchSeq = (batchCounter.get(batch.id) ?? 0) + 1
      batchCounter.set(batch.id, batchSeq)
      const wheel: CheeseWheel = {
        id: wheelId,
        batchId: batch.id,
        zoneId,
        slotId: zoneSlots[w % zoneSlots.length].id,
        wheelNo: batchSeq,
        label: `${batch.code}-${String(batchSeq).padStart(2, '0')}`,
        diameter,
        height,
        enteredAt: batch.createdAt,
        targetDays: batch.category === 'white_mold' ? 60 : batch.category === 'washed_rind' ? 180 : 540,
        seed: hashString(`${wheelId}:${batch.code}`),
        active: true,
      }
      wheels.push(wheel)

      // 问题轮：第 5、17、29 号在最近 6 周几乎无作业，制造蓝斑发黏
      const isNeglected = wheelSeq === 4 || wheelSeq === 16 || wheelSeq === 28
      buildCare(records, wheelId, ageDays, isNeglected, rand)
      if (ageDays > 20 && wheelSeq % 4 === 0) {
        inspections.push({
          id: uid('insp'),
          wheelId,
          at: iso(Math.min(ageDays, 7)),
          photoBlobId: null,
          diffScore: isNeglected ? 0.62 + rand() * 0.2 : rand() * 0.25,
          review: isNeglected ? 'flagged' : 'ok',
          note: isNeglected ? '蓝斑明显、外皮发黏，需复核' : '外观正常',
        })
      }
      wheelSeq++
    }
  }

  return { zones, batches, wheels, records, inspections }
}

function buildCare(
  records: CareRecord[],
  wheelId: string,
  ageDays: number,
  neglected: boolean,
  rand: () => number,
): void {
  const gap = neglected ? 45 : 7
  for (let d = ageDays; d > 0; d -= gap) {
    // 常规轮每周翻面，隔周刷皮；问题轮最近六周断档（靠大 gap 体现）
    records.push({
      id: uid('care'),
      wheelId,
      at: iso(d),
      action: 'turn',
      intensity: 0.5 + rand() * 0.3,
      operator: ['老周', '阿琳', '大山'][Math.floor(rand() * 3)],
    })
    if (d % 14 < 7) {
      records.push({
        id: uid('care'),
        wheelId,
        at: iso(d, 10),
        action: 'brush',
        intensity: 0.4 + rand() * 0.4,
        operator: '老周',
      })
    }
    if (d % 30 < 7 && rand() > 0.4) {
      records.push({
        id: uid('care'),
        wheelId,
        at: iso(d, 11),
        action: rand() > 0.5 ? 'oil' : 'brine_wash',
        intensity: 0.4 + rand() * 0.4,
        operator: '阿琳',
      })
    }
  }
}
