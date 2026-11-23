// 轮皮片元着色器（下）：法线重建与光照，主函数输出线性 HDR 色
import { RIND_SURFACE } from './rind_surface.glsl'

export const RIND_FRAGMENT = /* glsl */ `
${RIND_SURFACE}

uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uCameraPos;
uniform mat3 uNormalWorldMatrix;

out vec4 outColor;

// 由表面高度场沿切平面做有限差分，重建带毛孔/绒毛/裂纹起伏的法线
vec3 perturbNormal(vec3 p, vec3 n) {
  vec3 helper = abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t = normalize(cross(helper, n));
  vec3 b = normalize(cross(n, t));
  float e = 0.0016 / uScale;
  float hC = buildSurface(p, n).height;
  float hT = buildSurface(p + t * e, n).height;
  float hB = buildSurface(p + b * e, n).height;
  vec3 grad = t * ((hT - hC) / e) + b * ((hB - hC) / e);
  return normalize(n - grad * 0.55);
}

void main() {
  vec3 nGeom = normalize(vObjNormal);
  vec3 p = vObjPos;
  Surface s = buildSurface(p, nGeom);
  vec3 N = normalize(vWorldNormal);

  // 程序化微表面法线：物体空间高度差分，用世界法线矩阵变换后与几何法线混合
  vec3 nObjPert = perturbNormal(p, nGeom);
  vec3 worldPert = normalize(uNormalWorldMatrix * nObjPert);
  N = normalize(mix(N, worldPert, 0.7));

  vec3 V = normalize(uCameraPos - vWorldPos);
  float ndv = max(dot(N, V), 0.0);

  // 半球环境光
  float hemi = N.y * 0.5 + 0.5;
  vec3 ambient = mix(uGroundColor, uSkyColor, hemi) * 0.55;

  // 主光漫反射（带 wrap，柔和贴合软质奶酪）
  vec3 L = normalize(uKeyDir);
  float ndl = max(dot(N, L), 0.0);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  vec3 diffuse = uKeyColor * s.albedo * wrap;

  // 高光：粗糙度越低越锐（油膜、洗浸黏面在此显出湿亮）
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  float shininess = mix(90.0, 6.0, s.roughness);
  float spec = pow(ndh, shininess) * (1.0 - s.roughness) * 0.55;

  // 菲涅耳边缘：湿润皮与油膜边缘更亮
  float fresnel = pow(1.0 - ndv, 3.0);
  vec3 fresColor = mix(vec3(0.04), uKeyColor, 1.0 - s.roughness);

  vec3 color = ambient * s.albedo + diffuse + uKeyColor * spec + fresColor * fresnel * (1.0 - s.roughness * 0.7);

  // 微弱环境遮蔽：裂纹与凹点更暗（高度场负值处）
  color *= 1.0 - max(0.0, -s.height) * 0.08;

  outColor = vec4(color, 1.0);
}
`

// 灯光默认值（与场景灯光保持一致）
export const LIGHT_DEFAULTS = {
  keyDir: [0.55, 0.8, 0.42],
  keyColor: [1.0, 0.95, 0.86],
  skyColor: [0.52, 0.56, 0.62],
  groundColor: [0.22, 0.19, 0.16],
}
