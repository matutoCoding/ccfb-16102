// 领域模型：熟成窖 / 奶酪轮 / 翻刷记录 / 巡检 / 设置

// 三类奶酪：天然皮硬质、洗浸皮、白霉软质
export type CheeseCategory = 'natural_rind' | 'washed_rind' | 'white_mold'

export const CATEGORY_LABEL: Record<CheeseCategory, string> = {
  natural_rind: '天然皮硬质',
  washed_rind: '洗浸皮',
  white_mold: '白霉软质',
}

// 窖区通风口
export interface Vent {
  id: string
  name: string
  // 相对窖区坐标系的位置，单位米
  x: number
  y: number
  z: number
}

// 温湿度采样（巡检测量，一天可多条）
export interface ClimateSample {
  id: string
  at: string // ISO 时间
  tempC: number
  humidity: number // 0~1 相对湿度
  note?: string
}

// 杉木架上的一个具体位号
export interface ShelfSlot {
  id: string
  // 架号-层号-位号，如 A-2-05
  code: string
  shelf: string
  level: number
  position: number
  // 摆放坐标（米），整层渲染时使用
  x: number
  y: number
  z: number
}

export interface CaveZone {
  id: string
  name: string
  // 洞内分区，几何尺寸（米）
  width: number
  depth: number
  height: number
  targetTempC: number
  targetHumidity: number
  vents: Vent[]
  slots: ShelfSlot[]
  climate: ClimateSample[]
  createdAt: string
}

// 奶酪轮批次
export interface CheeseBatch {
  id: string
  code: string // 批次号，如 B-2026-014
  category: CheeseCategory
  maker: string
  milk: string // 奶源
  createdAt: string
}

// 单个奶酪轮（一个轮 = 一条可复现的外皮演化序列）
export interface CheeseWheel {
  id: string
  batchId: string
  zoneId: string
  slotId: string | null
  // 轮编号，同批次内唯一
  wheelNo: number
  label: string // 展示名，如 B-2026-014-07
  diameter: number // 直径（米）
  height: number // 高度（米）
  enteredAt: string // 入窖日期 ISO
  targetDays: number // 计划熟成天数
  // 决定一切程序化外观的种子：同轮同日必须渲染出完全一致的结果
  seed: number
  active: boolean
}

// 翻刷作业类型
export type CareAction = 'turn' | 'brush' | 'oil' | 'brine_wash'

export const CARE_LABEL: Record<CareAction, string> = {
  turn: '翻面',
  brush: '刷皮',
  oil: '抹油',
  brine_wash: '洗盐水',
}

export interface CareRecord {
  id: string
  wheelId: string
  at: string // ISO
  action: CareAction
  // 作业强度 0~1：刷皮力度、抹油厚薄、盐水浓度档位
  intensity: number
  operator: string
  note?: string
}

// 巡检照片
export interface Inspection {
  id: string
  wheelId: string
  at: string
  // 图片以 Blob 存 IndexedDB，这里只存 id 引用
  photoBlobId: string | null
  // 与程序画面并排比对后的差异分（0~1，越大越离谱）
  diffScore: number | null
  // 人工复核状态
  review: 'pending' | 'ok' | 'flagged'
  note?: string
}

// 霉菌与外观参数（设置页可调，写入后参与生长模型与着色器）
export interface MoldParams {
  // 白地霉：绒毛
  geotrichum: SpeciesParam
  // 青霉：蓝绿斑
  penicillium: SpeciesParam
  // 螨虫啃食：粉状麻点
  mite: SpeciesParam
  // 洗浸皮菌：橙红黏面
  smear: SpeciesParam
  // 干裂纹
  crack: CrackParam
}

export interface SpeciesParam {
  // 菌落点数量
  colonies: number
  // 基础生长速率（每天扩张的无量纲量）
  growthRate: number
  // 湿度偏好：低于该湿度生长受抑
  humidityLove: number
  // 着色强度 0~1
  strength: number
}

export interface CrackParam {
  // 触发裂纹的湿度阈值
  humidityThreshold: number
  // 裂纹密度
  density: number
  // 裂纹宽度
  width: number
}

export interface AppSettings {
  id: 'singleton'
  mold: MoldParams
  // 刷皮后霉斑保留比例（0~1）
  brushRemnant: number
  // 刷皮后恢复到自然状态的天数
  brushRecoverDays: number
  // 多少天不翻面，贴架面出现压痕湿斑
  neglectTurnDays: number
  // 外观色：入窖乳黄 -> 熟成棕褐
  rindYoung: [number, number, number]
  rindAged: [number, number, number]
  updatedAt: string
}

// 生长模型在某一天为某个轮子算出的外皮状态（着色器输入）
export interface RindState {
  day: number
  // 各菌种当前覆盖量 0~1
  geotrichum: number
  penicillium: number
  mite: number
  smear: number
  // 整体底色熟成度 0~1（乳黄->棕褐）
  browning: number
  // 干燥度 0~1，决定裂纹
  dryness: number
  // 裂纹强度 0~1
  cracking: number
  // 油膜 0~1
  oil: number
  // 贴架面压痕/湿斑强度 0~1
  contactWet: number
  // 最近一次刷皮后的恢复进度 0~1（0=刚刷完，1=完全恢复）
  brushRecovery: number
  // 最近一次刷皮时间（day 序号），无则 -1
  lastBrushDay: number
  // 最近一次翻面时间
  lastTurnDay: number
  // 预测场景标记：actual=真实档案，scenario=改了窖温的推演
  scenario: 'actual' | 'scenario'
}
