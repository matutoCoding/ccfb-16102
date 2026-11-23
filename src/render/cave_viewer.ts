// 三维查看器：整层俯瞰 / 单轮细看双模式，轨道控制与渲染循环
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { AppSettings, CaveZone, CheeseWheel, RindState } from '../types'
import { buildCaveStructure } from './cave_structure'
import { WheelMesh, type WheelRenderEntry } from './wheel_mesh'

export type ViewMode = 'shelf' | 'wheel'

export interface ViewerContext {
  zone: CaveZone
  wheels: CheeseWheel[]
  settings: AppSettings
}

export class CaveViewer {
  readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private controls!: OrbitControls
  private wheelMesh!: WheelMesh
  private structure!: ReturnType<typeof buildCaveStructure>
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private rafId = 0
  private mode: ViewMode = 'shelf'
  private selectedId: string | null = null
  private onSelect: (id: string | null) => void = () => undefined
  private mounted = false

  constructor(private readonly container: HTMLElement, private readonly ctx: ViewerContext) {
    // 两阶段初始化：构造时只建渲染器对象，mount 入屏后再按真实尺寸启动
    // preserveDrawingBuffer：支持巡检截图与可复现性像素比对
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.scene.background = new THREE.Color(0x24201c)
    this.scene.fog = new THREE.Fog(0x24201c, 9, 22)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 60)
    this.camera.position.set(1.7, 1.35, 2.35)
  }

  // 元素进入 DOM 后调用，此时 clientWidth/Height 才有真实值
  mount(): void {
    if (this.mounted) return
    this.mounted = true
    const w = this.container.clientWidth || 640
    const h = this.container.clientHeight || 420
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 0.18
    this.controls.maxDistance = 12
    this.controls.target.set(0, 0.6, 0)

    this.addLights()

    this.structure = buildCaveStructure(this.ctx.zone)
    this.scene.add(this.structure.group)

    this.wheelMesh = new WheelMesh(this.ctx.settings)
    for (const wheel of this.ctx.wheels) this.wheelMesh.addWheel(wheel)
    this.scene.add(this.wheelMesh.group)
    this.relayout()

    this.renderer.domElement.addEventListener('pointerdown', this.handlePick)
    window.addEventListener('resize', this.handleResize)
    this.loop()
  }

  private addLights(): void {
    const key = new THREE.DirectionalLight(0xfff2dd, 2.8)
    key.position.set(2.2, 3.6, 2.2)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xaec4e6, 0.85)
    fill.position.set(-2.4, 1.6, -1.4)
    this.scene.add(fill)
    this.scene.add(new THREE.HemisphereLight(0xaab4c2, 0x4a3f33, 1.05))
  }

  // 按窖区位号把轮子摆上杉木架
  private relayout(): void {
    const positions = new Map<string, THREE.Vector3>()
    const slotById = new Map(this.ctx.zone.slots.map((s) => [s.id, s]))
    for (const wheel of this.ctx.wheels) {
      if (!wheel.slotId) continue
      const slot = slotById.get(wheel.slotId)
      if (!slot) continue
      const anchor = this.structure.slotAnchors.get(slot.id)
      if (anchor) positions.set(wheel.id, anchor.clone().setY(anchor.y + wheel.height / 2))
    }
    this.wheelMesh.layout(positions)
  }

  get isMounted(): boolean {
    return this.mounted
  }

  setState(wheelId: string, state: RindState): void {
    if (!this.mounted) return
    this.wheelMesh.updateState(wheelId, state)
  }

  setAllStates(states: Map<string, RindState>): void {
    if (!this.mounted) return
    for (const [id, state] of states) this.wheelMesh.updateState(id, state)
  }

  setSelectHandler(handler: (id: string | null) => void): void {
    this.onSelect = handler
  }

  getSelected(): string | null {
    return this.selectedId
  }

  focusWheel(wheelId: string | null): void {
    if (!this.mounted) return
    this.selectedId = wheelId
    if (!wheelId) {
      this.setMode('shelf')
      return
    }
    this.setMode('wheel')
    const entry = this.wheelMesh.getEntry(wheelId)
    if (!entry) return
    const wp = new THREE.Vector3()
    entry.mesh.getWorldPosition(wp)
    this.controls.target.copy(wp)
    const dist = Math.max(entry.wheel.diameter * 1.8, 0.4)
    this.camera.position.copy(wp).add(new THREE.Vector3(dist, dist * 0.55, dist))
  }

  setMode(mode: ViewMode): void {
    if (!this.mounted) return
    this.mode = mode
    // 单轮模式隐藏架子与其他轮子，整层模式全部可见
    if (mode === 'wheel' && this.selectedId) {
      this.structure.group.visible = false
      for (const e of this.wheelMesh.all) e.mesh.visible = e.wheel.id === this.selectedId
    } else {
      this.structure.group.visible = true
      this.relayout()
    }
  }

  get currentMode(): ViewMode {
    return this.mode
  }

  // 预测页单轮对比时隐藏窖区架子，只保留轮子
  setCaveVisible(visible: boolean): void {
    if (!this.mounted) return
    this.structure.group.visible = visible
  }

  // 把相机推近并居中到指定轮子（不进入选择模式，纯取景）
  frameWheel(wheelId: string): void {
    if (!this.mounted) return
    const entry = this.wheelMesh.getEntry(wheelId)
    if (!entry) return
    const wp = new THREE.Vector3()
    entry.mesh.getWorldPosition(wp)
    this.controls.target.copy(wp)
    const dist = Math.max(entry.wheel.diameter * 2.2, 0.45)
    this.camera.position.copy(wp).add(new THREE.Vector3(dist, dist * 0.5, dist))
    this.camera.near = Math.max(0.01, entry.wheel.diameter * 0.05)
    this.camera.updateProjectionMatrix()
  }

  getEntry(wheelId: string): WheelRenderEntry | undefined {
    return this.wheelMesh.getEntry(wheelId)
  }

  private handlePick = (event: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const meshes = this.wheelMesh.all.filter((e) => e.mesh.visible).map((e) => e.mesh)
    const hit = this.raycaster.intersectObjects(meshes, false)[0]
    if (hit) {
      const entry = this.wheelMesh.all.find((e) => e.mesh === hit.object)
      if (entry) this.onSelect(entry.wheel.id)
    }
  }

  private handleResize = (): void => {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop)
    this.controls.update()
    this.wheelMesh.syncCamera(this.camera)
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId)
    window.removeEventListener('resize', this.handleResize)
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePick)
    this.controls.dispose()
    this.wheelMesh.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
