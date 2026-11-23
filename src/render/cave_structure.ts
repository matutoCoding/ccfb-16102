// 窖区场景结构：杉木架、层板、通风口标记、地面，全部基础材质与轮皮着色器解耦
import * as THREE from 'three'
import type { CaveZone } from '../types'

const WOOD_COLOR = new THREE.Color(0x6b5138)
const SLAT_COLOR = new THREE.Color(0x7a5f43)

export interface CaveStructure {
  group: THREE.Group
  // 层位号 -> 摆放基准坐标（轮中心）
  slotAnchors: Map<string, THREE.Vector3>
}

export function buildCaveStructure(zone: CaveZone): CaveStructure {
  const group = new THREE.Group()
  const slotAnchors = new Map<string, THREE.Vector3>()

  const woodMat = new THREE.MeshStandardMaterial({ color: WOOD_COLOR, roughness: 0.92 })
  const slatMat = new THREE.MeshStandardMaterial({ color: SLAT_COLOR, roughness: 0.9 })

  // 地面
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(zone.width, zone.depth),
    new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 1 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0
  floor.receiveShadow = true
  group.add(floor)

  // 后墙与侧墙（山洞岩石感的深色）
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1 })
  const back = new THREE.Mesh(new THREE.PlaneGeometry(zone.width, zone.height), wallMat)
  back.position.set(0, zone.height / 2, -zone.depth / 2)
  group.add(back)
  const side = new THREE.Mesh(new THREE.PlaneGeometry(zone.depth, zone.height), wallMat)
  side.rotation.y = Math.PI / 2
  side.position.set(-zone.width / 2, zone.height / 2, 0)
  group.add(side)

  // 按架子分组建杉木架
  const shelves = new Map<string, typeof zone.slots>()
  for (const slot of zone.slots) {
    const list = shelves.get(slot.shelf)
    if (list) list.push(slot)
    else shelves.set(slot.shelf, [slot])
  }

  const box = (w: number, h: number, d: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  for (const [shelfName, slots] of shelves) {
    const levels = [...new Set(slots.map((s) => s.level))].sort((a, b) => a - b)
    const maxPos = Math.max(...slots.map((s) => s.position))
    const shelfX = slots[0].x
    const shelfZ = slots[0].z
    const width = (maxPos + 1) * 0.34

    for (const level of levels) {
      const levelSlots = slots.filter((s) => s.level === level)
      const y = levelSlots[0].y
      // 层板：两条板条，中间留缝（压痕湿斑的物理来源）
      for (const offsetZ of [-0.09, 0.09]) {
        const slat = box(width, 0.035, 0.12, slatMat)
        slat.position.set(shelfX, y - 0.1, shelfZ + offsetZ)
        group.add(slat)
      }
      // 立柱
      for (const px of [shelfX - width / 2, shelfX + width / 2]) {
        const post = box(0.06, 0.06, zone.depth * 0.5, woodMat)
        post.position.set(px, y, shelfZ)
        group.add(post)
      }
      for (const slot of levelSlots) {
        slotAnchors.set(slot.id, new THREE.Vector3(slot.x, slot.y, slot.z))
      }
    }
    // 架号标牌（sprite 文字由 CSS2D 更合适，这里用简单小色条标识）
    const tag = box(0.18, 0.06, 0.02, new THREE.MeshStandardMaterial({ color: 0x2f6f5e }))
    tag.position.set(shelfX - width / 2, levels[0] ? 0.4 : 0.4, shelfZ)
    group.add(tag)
    void shelfName
  }

  // 通风口：青灰色金属罩 + 方向指示
  const ventMat = new THREE.MeshStandardMaterial({
    color: 0x71808c,
    metalness: 0.6,
    roughness: 0.4,
  })
  for (const vent of zone.vents) {
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20), ventMat)
    duct.rotation.x = Math.PI / 2
    duct.position.set(vent.x, vent.y, vent.z)
    group.add(duct)
  }

  return { group, slotAnchors }
}
