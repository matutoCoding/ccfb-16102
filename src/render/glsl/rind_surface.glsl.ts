// 轮皮片元着色器（上）：uniform 契约与四种霉/菌的程序化表面合成
// 设计约束：全部以物体空间 vObjPos 为输入，侧面与上下盖共享同一噪声场，无接缝、无贴图
import { GLSL_NOISE } from './noise.glsl'

export const RIND_SURFACE = /* glsl */ `
${GLSL_NOISE}

#define MAX_COL 16

uniform float uSeed;
uniform float uScale;
uniform vec3 uRindYoung;
uniform vec3 uRindAged;
uniform float uBrowning;
uniform float uDryness;
uniform float uCracking;
uniform float uCrackWidth;
uniform float uOil;
uniform float uContactWet;
uniform float uBrushRecovery;
uniform float uContactSign;

uniform float uGeo;
uniform float uPen;
uniform float uMite;
uniform float uSmear;
uniform float uGeoRadius;
uniform float uPenRadius;
uniform float uMiteRadius;
uniform float uSmearRadius;

uniform vec3 uGeoColony[MAX_COL];
uniform vec3 uPenColony[MAX_COL];
uniform vec3 uMiteColony[MAX_COL];
uniform vec3 uSmearColony[MAX_COL];
uniform int uGeoCount;
uniform int uPenCount;
uniform int uMiteCount;
uniform int uSmearCount;

in vec3 vObjPos;
in vec3 vWorldNormal;
in vec3 vWorldPos;
in vec3 vObjNormal;

// 菌落场：围绕确定性落点做角向扩张，域扭曲让边界呈菌丝状，扩张只改半径不跳点
float colonyField(vec3 dir, vec3 points[MAX_COL], int count, float radius, float warpSeed) {
  if (count == 0 || radius <= 0.001) return 0.0;
  float mask = 0.0;
  vec3 warp = domainWarp(dir * 3.0 + warpSeed, 0.35) - dir * 3.0;
  for (int i = 0; i < MAX_COL; i++) {
    if (i >= count) break;
    vec3 cdir = normalize(points[i] + warp * 0.05);
    float d = acos(clamp(dot(dir, cdir), -1.0, 1.0));
    float cell = 1.0 - smoothstep(radius - 0.03, radius + 0.10, d);
    mask = max(mask, cell);
  }
  return mask;
}

// 散点卫星斑：主菌落之外的零星萌发，随覆盖量增多
float satelliteSpots(vec3 p, float coverage, float freq, float seedOff) {
  vec3 q = domainWarp(p * freq + seedOff + uSeed * 0.013, 0.4);
  float n = fbm(q, 4, 2.02, 0.5);
  return smoothstep(1.0 - coverage * 0.9, 1.05, n + 0.5) * coverage;
}

struct Surface {
  vec3 albedo;
  float roughness;
  float height; // 供法线扰动的高度场
};

Surface buildSurface(vec3 p, vec3 nDir) {
  Surface s;
  s.roughness = 0.82;
  s.height = 0.0;

  // ---- 基底：乳黄 -> 棕褐，大尺度 fbm 做自然色差 ----
  vec3 warpLarge = domainWarp(p * (1.6 * uScale) + uSeed * 0.007, 0.5);
  float tone = fbm(warpLarge, 5, 2.02, 0.5) * 0.5 + 0.5;
  vec3 base = mix(uRindYoung, uRindAged, clamp(uBrowning * (0.75 + 0.5 * tone), 0.0, 1.0));
  base *= 0.9 + 0.2 * tone;

  // ---- 毛孔：高频 Worley 凹点，任何距离都存在，放大不糊不重复 ----
  float pore = worley(p * (95.0 * uScale) + uSeed * 0.021, 0.9);
  float poreMask = 1.0 - smoothstep(0.02, 0.16, pore);
  s.height -= poreMask * 0.35;
  base *= 1.0 - poreMask * 0.18;

  // ---- 干裂纹：Worley F1-F2 脊线 + 域扭曲，密度随干燥度 ----
  vec3 crackP = domainWarp(p * (7.0 * uScale) + uSeed * 0.011, 0.6);
  vec2 ff = worleyF1F2(crackP);
  float ridge = ff.y - ff.x;
  float crack = (1.0 - smoothstep(uCrackWidth * 0.4, uCrackWidth * 1.8, ridge)) * uCracking;
  s.height -= crack * 2.2;
  base = mix(base, vec3(0.16, 0.09, 0.05), crack * 0.85);

  // ---- 白地霉绒毛：高频 fbm 白绒，刷皮后按恢复度长出 ----
  float geoCol = colonyField(nDir, uGeoColony, uGeoCount, uGeoRadius, 1.7);
  float geoScatter = satelliteSpots(p, uGeo, 22.0, 3.1);
  float velvet = fbm(p * (140.0 * uScale) + uSeed * 0.017, 5, 2.02, 0.55) * 0.5 + 0.5;
  float geo = clamp(max(geoCol, geoScatter * 0.7) * uGeo, 0.0, 1.0);
  geo *= 0.35 + 0.65 * uBrushRecovery;
  vec3 geoColor = mix(vec3(0.93, 0.92, 0.82), vec3(1.0, 0.99, 0.94), velvet);
  base = mix(base, geoColor, geo * 0.85);
  s.height += velvet * geo * 0.9;
  s.roughness -= geo * 0.12;

  // ---- 青霉蓝绿斑：中频 Worley 细胞 + 域扭曲，菌落锚点扩张 ----
  float penCol = colonyField(nDir, uPenColony, uPenCount, uPenRadius, 5.3);
  float penScatter = satelliteSpots(p, uPen, 11.0, 9.4);
  float penTex = fbm(domainWarp(p * (38.0 * uScale) + uSeed * 0.029, 0.5), 4, 2.02, 0.5) * 0.5 + 0.5;
  float pen = clamp(max(penCol, penScatter * 0.6) * uPen, 0.0, 1.0);
  vec3 penColor = mix(vec3(0.28, 0.43, 0.40), vec3(0.45, 0.60, 0.55), penTex);
  base = mix(base, penColor, pen * 0.9);
  s.height += pen * 0.35;

  // ---- 螨虫粉状麻点：细 Worley 啃痕，灰白色粉化 ----
  float miteCol = colonyField(nDir, uMiteColony, uMiteCount, uMiteRadius, 11.9);
  float mitePits = 1.0 - smoothstep(0.03, 0.22, worley(p * (120.0 * uScale) + uSeed * 0.037, 1.0));
  float mite = clamp(max(miteCol, mitePits * 0.8) * uMite, 0.0, 1.0);
  vec3 miteColor = vec3(0.62, 0.57, 0.48);
  base = mix(base, miteColor, mite * 0.6);
  s.height -= mite * 0.5;

  // ---- 洗浸皮橙红黏面：低频平滑斑块，湿润高反光 ----
  float smearCol = colonyField(nDir, uSmearColony, uSmearCount, uSmearRadius, 17.2);
  float smearWet = fbm(domainWarp(p * (4.5 * uScale) + uSeed * 0.043, 0.7), 4, 2.02, 0.5) * 0.5 + 0.5;
  float smear = clamp(smearCol * uSmear * (0.6 + 0.6 * smearWet), 0.0, 1.0);
  vec3 smearColor = mix(vec3(0.62, 0.28, 0.12), vec3(0.85, 0.45, 0.18), smearWet);
  base = mix(base, smearColor, smear * 0.88);
  s.roughness -= smear * 0.45;
  s.height += smear * 0.12;

  // ---- 贴架面压痕与湿斑：接触极附近暗湿区 + 架板条状压痕 ----
  float polar = uContactSign * nDir.y;
  float contact = smoothstep(0.5, 0.93, polar) * uContactWet;
  float slat = 1.0 - smoothstep(0.04, 0.16, abs(fract(p.x * (6.0 * uScale) + uSeed * 0.01) - 0.5) - 0.18);
  base = mix(base, base * vec3(0.45, 0.42, 0.38), contact * (0.55 + slat * 0.35));
  s.height -= contact * slat * 0.8;
  s.roughness -= contact * 0.2;

  // ---- 油膜：整体压暗反光，粗糙率下降 ----
  s.roughness = clamp(s.roughness - uOil * 0.35, 0.12, 0.95);
  base = mix(base, base * vec3(0.82, 0.78, 0.68) + vec3(0.05, 0.04, 0.02), uOil * 0.5);

  s.albedo = base;
  return s;
}
`
