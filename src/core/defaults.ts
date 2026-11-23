// 默认设置：四类菌种与裂纹的初始参数，设置页可改并持久化
import type { AppSettings, MoldParams } from '../types'

export const DEFAULT_MOLD: MoldParams = {
  geotrichum: {
    colonies: 12,
    growthRate: 0.012,
    humidityLove: 0.9,
    strength: 0.85,
  },
  penicillium: {
    colonies: 8,
    growthRate: 0.008,
    humidityLove: 0.88,
    strength: 0.9,
  },
  mite: {
    colonies: 6,
    growthRate: 0.004,
    humidityLove: 0.82,
    strength: 0.8,
  },
  smear: {
    colonies: 10,
    growthRate: 0.01,
    humidityLove: 0.92,
    strength: 0.95,
  },
  crack: {
    humidityThreshold: 0.8,
    density: 0.85,
    width: 0.09,
  },
}

export function defaultSettings(): AppSettings {
  return {
    id: 'singleton',
    mold: structuredClone(DEFAULT_MOLD),
    brushRemnant: 0.25,
    brushRecoverDays: 21,
    neglectTurnDays: 14,
    // 乳黄 -> 棕褐
    rindYoung: [0.82, 0.68, 0.42],
    rindAged: [0.36, 0.22, 0.12],
    updatedAt: new Date().toISOString(),
  }
}
