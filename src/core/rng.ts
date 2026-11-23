// 确定性随机：所有随机外观均由 wheel.seed 派生，保证同日同轮渲染完全一致

// 字符串 -> uint32（cyrb128 取第一字）
export function hashString(str: string): number {
  let h1 = 1779033703 ^ str.length
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ k, 597399067)
    h2 = Math.imul(h2 ^ k, 2869860233)
    h3 = Math.imul(h3 ^ k, 951274213)
    h4 = Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return h1 >>> 0
}

// mulberry32：种子化 PRNG，同种子序列完全一致
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 由种子 + 用途标签派生独立子流，避免不同特征抢同一条随机序列
export function stream(seed: number, tag: string): () => number {
  return mulberry32(hashString(`${seed}:${tag}`))
}

// 球面均匀取点（菌落落点：贴在轮子表面的单位方向）
export function randomUnitVector(rand: () => number): [number, number, number] {
  const z = rand() * 2 - 1
  const theta = rand() * Math.PI * 2
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  return [r * Math.cos(theta), z, r * Math.sin(theta)]
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

// 指数平滑趋近：每过 dt 天向 target 靠 factor 比例
export function approach(current: number, target: number, ratePerDay: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-ratePerDay * dt))
}

let uidCounter = 0
// uid 仅用于档案主键，不参与任何外观随机，故可用 Math.random
export function uid(prefix: string): string {
  uidCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}_${Math.floor(
    Math.random() * 1e6,
  ).toString(36)}`
}
