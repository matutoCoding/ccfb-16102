// Uniform 装配：RindState + 菌落 + 设置 -> 着色器 uniform
import * as THREE from 'three'
import type { AppSettings, CheeseWheel, RindState } from '../types'
import { colonyRadius, MAX_COLONIES, type ColonySet, type SpeciesKey } from '../core/colony'
import { LIGHT_DEFAULTS } from './glsl/rind_fragment.glsl'

export interface WheelUniforms {
  [name: string]: THREE.IUniform
}

const zeroColony = () => new Array(MAX_COLONIES).fill(0).map(() => new THREE.Vector3(0, -2, 0))

export function createWheelUniforms(
  wheel: CheeseWheel,
  colonies: ColonySet,
  settings: AppSettings,
): WheelUniforms {
  return {
    uSeed: { value: wheel.seed % 100000 },
    // 噪声场按物理尺寸归一：所有轮子毛孔绝对尺寸一致，大轮不会被拉大
    uScale: { value: 1 / Math.max(wheel.diameter, 0.01) },
    uRindYoung: { value: new THREE.Color(...settings.rindYoung) },
    uRindAged: { value: new THREE.Color(...settings.rindAged) },

    uBrowning: { value: 0 },
    uDryness: { value: 0 },
    uCracking: { value: 0 },
    uCrackWidth: { value: settings.mold.crack.width },
    uOil: { value: 0 },
    uContactWet: { value: 0 },
    uBrushRecovery: { value: 1 },
    uContactSign: { value: -1 },

    uGeo: { value: 0 },
    uPen: { value: 0 },
    uMite: { value: 0 },
    uSmear: { value: 0 },
    uGeoRadius: { value: 0.01 },
    uPenRadius: { value: 0.01 },
    uMiteRadius: { value: 0.01 },
    uSmearRadius: { value: 0.01 },

    uGeoColony: { value: toVec3Array(colonies.geotrichum) },
    uPenColony: { value: toVec3Array(colonies.penicillium) },
    uMiteColony: { value: toVec3Array(colonies.mite) },
    uSmearColony: { value: toVec3Array(colonies.smear) },
    uGeoCount: { value: colonies.counts.geotrichum },
    uPenCount: { value: colonies.counts.penicillium },
    uMiteCount: { value: colonies.counts.mite },
    uSmearCount: { value: colonies.counts.smear },

    uKeyDir: { value: new THREE.Vector3(...LIGHT_DEFAULTS.keyDir) },
    uKeyColor: { value: new THREE.Color(...LIGHT_DEFAULTS.keyColor) },
    uSkyColor: { value: new THREE.Color(...LIGHT_DEFAULTS.skyColor) },
    uGroundColor: { value: new THREE.Color(...LIGHT_DEFAULTS.groundColor) },
    uCameraPos: { value: new THREE.Vector3() },
    // 世界空间法线矩阵（逆转置），每帧由 WheelMesh.syncCamera 同步
    uNormalWorldMatrix: { value: new THREE.Matrix3() },
  }
}

function toVec3Array(flat: Float32Array): THREE.Vector3[] {
  const out = zeroColony()
  for (let i = 0; i < MAX_COLONIES; i++) {
    out[i].set(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2])
  }
  return out
}

// 每帧/每次拖时间轴调用：仅改 uniform 数值，材质与几何不重建
export function applyRindState(uniforms: WheelUniforms, state: RindState): void {
  uniforms.uBrowning.value = state.browning
  uniforms.uDryness.value = state.dryness
  uniforms.uCracking.value = state.cracking
  uniforms.uOil.value = state.oil
  uniforms.uContactWet.value = state.contactWet
  uniforms.uBrushRecovery.value = state.brushRecovery

  uniforms.uGeo.value = state.geotrichum
  uniforms.uPen.value = state.penicillium
  uniforms.uMite.value = state.mite
  uniforms.uSmear.value = state.smear

  uniforms.uGeoRadius.value = colonyRadius(state.geotrichum, state.day)
  uniforms.uPenRadius.value = colonyRadius(state.penicillium, state.day)
  uniforms.uMiteRadius.value = colonyRadius(state.mite, state.day)
  uniforms.uSmearRadius.value = colonyRadius(state.smear, state.day)
}

export function colonyCountFor(settings: AppSettings): Record<SpeciesKey, number> {
  return {
    geotrichum: settings.mold.geotrichum.colonies,
    penicillium: settings.mold.penicillium.colonies,
    mite: settings.mold.mite.colonies,
    smear: settings.mold.smear.colonies,
  }
}
