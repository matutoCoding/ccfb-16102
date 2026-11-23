// 奶酪轮几何：车削轮廓生成鼓侧圆轮，UV 不参与外皮纹理，仅物体空间坐标驱动着色器
import * as THREE from 'three'

// 轮廓点（半径, 高度），从底盖中心 -> 圆缘 -> 鼓侧 -> 顶缘 -> 顶盖中心
export function buildWheelGeometry(diameter: number, height: number): THREE.LatheGeometry {
  const r = diameter / 2
  const h = height
  const bevel = Math.min(r * 0.16, h * 0.22) // 轮缘圆角
  const pts: THREE.Vector2[] = []

  pts.push(new THREE.Vector2(0, -h / 2))
  pts.push(new THREE.Vector2(r - bevel * 1.6, -h / 2))

  // 底缘圆角（四分之一圆弧）
  const seg = 6
  for (let i = 1; i <= seg; i++) {
    const a = -Math.PI / 2 + (i / seg) * (Math.PI / 2)
    pts.push(
      new THREE.Vector2(
        r - bevel + bevel * Math.cos(a),
        -h / 2 + bevel + bevel * Math.sin(a),
      ),
    )
  }

  // 鼓侧：中段外鼓 3%，还原硬质奶酪轮的桶形
  const sideSeg = 10
  for (let i = 1; i < sideSeg; i++) {
    const t = i / sideSeg
    const y = -h / 2 + bevel + t * (h - 2 * bevel)
    const bulge = 1 + 0.03 * Math.sin(Math.PI * t)
    pts.push(new THREE.Vector2((r - bevel * 0.25) * bulge, y))
  }

  // 顶缘圆角
  for (let i = 1; i <= seg; i++) {
    const a = (i / seg) * (Math.PI / 2)
    pts.push(
      new THREE.Vector2(
        r - bevel + bevel * Math.cos(a),
        h / 2 - bevel + bevel * Math.sin(a),
      ),
    )
  }
  pts.push(new THREE.Vector2(r - bevel * 1.6, h / 2))
  pts.push(new THREE.Vector2(0, h / 2))

  const geo = new THREE.LatheGeometry(pts, 96)
  geo.computeVertexNormals()
  return geo
}
