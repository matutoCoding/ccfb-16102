// 轮阵管理：所有轮子共享同一份单位几何与同一个 GPU 程序，差异全在各自 uniform
// 几十个子 SubMesh 各带独立材质实例（同 program 缓存），单轮细看与整层俯瞰共用
import * as THREE from 'three'
import type { AppSettings, CheeseWheel, RindState } from '../types'
import { buildColonies } from '../core/colony'
import { buildWheelGeometry } from './wheel_geometry'
import { applyRindState, createWheelUniforms, type WheelUniforms } from './wheel_uniforms'
import { RIND_VERTEX } from './glsl/rind_vertex.glsl'
import { RIND_FRAGMENT } from './glsl/rind_fragment.glsl'

export interface WheelRenderEntry {
  wheel: CheeseWheel
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  uniforms: WheelUniforms
  state: RindState | null
}

export class WheelMesh {
  readonly group = new THREE.Group()
  private readonly entries: WheelRenderEntry[] = []
  private readonly geometry: THREE.BufferGeometry

  constructor(private readonly settings: AppSettings) {
    // 单位轮（直径1、高0.5），各 Mesh 缩放到真实尺寸
    this.geometry = buildWheelGeometry(1, 0.5)
  }

  addWheel(wheel: CheeseWheel): WheelRenderEntry {
    const colonies = buildColonies(wheel, {
      geotrichum: this.settings.mold.geotrichum.colonies,
      penicillium: this.settings.mold.penicillium.colonies,
      mite: this.settings.mold.mite.colonies,
      smear: this.settings.mold.smear.colonies,
    })
    const uniforms = createWheelUniforms(wheel, colonies, this.settings)
    const material = new THREE.ShaderMaterial({
      vertexShader: RIND_VERTEX,
      fragmentShader: RIND_FRAGMENT,
      glslVersion: THREE.GLSL3,
      uniforms,
    })
    const mesh = new THREE.Mesh(this.geometry, material)
    // 单位直径 -> 真实直径；单位高 0.5 -> 真实高度
    mesh.scale.set(wheel.diameter, wheel.height / 0.5, wheel.diameter)
    mesh.rotation.y = (wheel.seed % 360) * (Math.PI / 180)
    mesh.castShadow = true
    this.group.add(mesh)

    const entry: WheelRenderEntry = { wheel, mesh, material, uniforms, state: null }
    this.entries.push(entry)
    return entry
  }

  getEntry(wheelId: string): WheelRenderEntry | undefined {
    return this.entries.find((e) => e.wheel.id === wheelId)
  }

  get all(): readonly WheelRenderEntry[] {
    return this.entries
  }

  updateState(wheelId: string, state: RindState): void {
    const entry = this.getEntry(wheelId)
    if (!entry) return
    entry.state = state
    applyRindState(entry.uniforms, state)
  }

  // 按位号摆放：positions 给轮 id -> 世界坐标
  layout(positions: Map<string, THREE.Vector3>): void {
    for (const entry of this.entries) {
      const pos = positions.get(entry.wheel.id)
      if (pos) entry.mesh.position.copy(pos)
      entry.mesh.visible = Boolean(pos)
    }
  }

  // 每帧同步相机位置与世界法线矩阵（内建 normalMatrix 仅在顶点着色器可用）
  syncCamera(camera: THREE.Camera): void {
    const normalMat = new THREE.Matrix3()
    for (const entry of this.entries) {
      entry.uniforms.uCameraPos.value.copy(camera.position)
      entry.mesh.updateWorldMatrix(true, false)
      normalMat.setFromMatrix4(entry.mesh.matrixWorld).invert().transpose()
      ;(entry.uniforms.uNormalWorldMatrix.value as THREE.Matrix3).copy(normalMat)
    }
  }

  dispose(): void {
    this.geometry.dispose()
    for (const entry of this.entries) entry.material.dispose()
  }
}
