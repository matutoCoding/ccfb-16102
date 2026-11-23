// 菌落点生成：由轮子 seed 确定性派生，落在轮面单位方向上
// 同轮子永远得到同一组点，霉斑只是围绕这些锚点随天数连续扩张
import type { CheeseWheel } from '../types'
import { randomUnitVector, stream } from './rng'

export const MAX_COLONIES = 16

export type SpeciesKey = 'geotrichum' | 'penicillium' | 'mite' | 'smear'

export interface ColonySet {
  geotrichum: Float32Array
  penicillium: Float32Array
  mite: Float32Array
  smear: Float32Array
  counts: Record<SpeciesKey, number>
}

const TAGS: Record<SpeciesKey, string> = {
  geotrichum: 'colony-geo',
  penicillium: 'colony-pen',
  mite: 'colony-mite',
  smear: 'colony-smear',
}

function buildArray(wheel: CheeseWheel, key: SpeciesKey, count: number): Float32Array {
  const rand = stream(wheel.seed, TAGS[key])
  const arr = new Float32Array(MAX_COLONIES * 3)
  const n = Math.min(MAX_COLONIES, Math.max(0, count))
  for (let i = 0; i < n; i++) {
    const [x, y, z] = randomUnitVector(rand)
    arr[i * 3] = x
    arr[i * 3 + 1] = y
    arr[i * 3 + 2] = z
  }
  return arr
}

export function buildColonies(
  wheel: CheeseWheel,
  counts: Record<SpeciesKey, number>,
): ColonySet {
  return {
    geotrichum: buildArray(wheel, 'geotrichum', counts.geotrichum),
    penicillium: buildArray(wheel, 'penicillium', counts.penicillium),
    mite: buildArray(wheel, 'mite', counts.mite),
    smear: buildArray(wheel, 'smear', counts.smear),
    counts: {
      geotrichum: Math.min(MAX_COLONIES, counts.geotrichum),
      penicillium: Math.min(MAX_COLONIES, counts.penicillium),
      mite: Math.min(MAX_COLONIES, counts.mite),
      smear: Math.min(MAX_COLONIES, counts.smear),
    },
  }
}

// 菌落在某一天的角向扩张半径（弧度）：从点状起步，随覆盖量近似平方根扩张
export function colonyRadius(coverage: number, day: number): number {
  const growth = Math.min(1, day / 120)
  return 0.015 + 0.55 * Math.sqrt(Math.max(0, coverage)) * (0.35 + 0.65 * growth)
}
