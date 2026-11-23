// 轮皮顶点着色器：物体空间坐标原样透传给片元做无接缝程序化纹理
// 多轮共享同一 GPU 程序，差异全部在 uniform，缩放放在 Mesh.scale 上
// position/normal/各矩阵均为 three.js 内建注入，禁止重复声明

export const RIND_VERTEX = /* glsl */ `
out vec3 vObjPos;
out vec3 vWorldNormal;
out vec3 vWorldPos;
out vec3 vObjNormal;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vObjPos = position;
  vObjNormal = normal;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
