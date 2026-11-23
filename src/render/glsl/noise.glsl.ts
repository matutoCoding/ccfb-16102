// GLSL 公共噪声库：全部在三维物体空间计算，轮面与上下盖同源连续，无 UV 接缝
// 整数 hash 保证放大到毛孔级仍无规律可循，fBm 旋转矩阵打破轴对齐与周期感
// 注意：不写 #version，three.js 在 GLSL3 模式下自动注入，手写会触发编译错误

export const GLSL_NOISE = /* glsl */ `
// ---- 整数 hash（David Hoskins pcg 风格，无 sin 量化瑕疵）----
uvec3 pcg3d(uvec3 v) {
  v = v * 747796405u + 2891336453u;
  v = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return (v >> 22u) ^ v;
}

vec3 hash33(vec3 p) {
  uvec3 q = pcg3d(floatBitsToUint(p));
  return vec3(q) / float(0xffffffffu);
}

float hash13(vec3 p) {
  uvec3 q = pcg3d(floatBitsToUint(p));
  return float(q.x) / float(0xffffffffu);
}

// 三维 Perlin 风格梯度噪声，返回 -1..1 噪声值，同时输出解析梯度
vec3 gnoise(vec3 p, out float value) {
  vec3 i = floor(p);
  vec3 d = fract(p);
  vec3 u = d * d * d * (d * (d * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * d * d * (d * (d - 2.0) + 1.0);

  vec3 g000 = hash33(i + vec3(0,0,0)) * 2.0 - 1.0;
  vec3 g100 = hash33(i + vec3(1,0,0)) * 2.0 - 1.0;
  vec3 g010 = hash33(i + vec3(0,1,0)) * 2.0 - 1.0;
  vec3 g110 = hash33(i + vec3(1,1,0)) * 2.0 - 1.0;
  vec3 g001 = hash33(i + vec3(0,0,1)) * 2.0 - 1.0;
  vec3 g101 = hash33(i + vec3(1,0,1)) * 2.0 - 1.0;
  vec3 g011 = hash33(i + vec3(0,1,1)) * 2.0 - 1.0;
  vec3 g111 = hash33(i + vec3(1,1,1)) * 2.0 - 1.0;

  float n000 = dot(g000, d - vec3(0,0,0));
  float n100 = dot(g100, d - vec3(1,0,0));
  float n010 = dot(g010, d - vec3(0,1,0));
  float n110 = dot(g110, d - vec3(1,1,0));
  float n001 = dot(g001, d - vec3(0,0,1));
  float n101 = dot(g101, d - vec3(1,0,1));
  float n011 = dot(g011, d - vec3(0,1,1));
  float n111 = dot(g111, d - vec3(1,1,1));

  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  float nxy0 = mix(nx00, nx10, u.y);
  float nxy1 = mix(nx01, nx11, u.y);
  value = mix(nxy0, nxy1, u.z);

  vec3 temp0 = mix(g000, g100, u.x);
  vec3 temp1 = mix(g010, g110, u.x);
  vec3 temp2 = mix(g001, g101, u.x);
  vec3 temp3 = mix(g011, g111, u.x);
  vec3 temp4 = mix(temp0, temp1, u.y);
  vec3 temp5 = mix(temp2, temp3, u.y);
  vec3 grad = mix(temp4, temp5, u.z);
  return grad;
}

// 每倍频旋转，避免轴向重复与栅格感
const mat3 ROT = mat3(
   0.00,  0.80,  0.60,
  -0.80,  0.36, -0.48,
  -0.60, -0.48,  0.64
);

float fbm(vec3 p, int octaves, float lacunarity, float gain) {
  float sum = 0.0;
  float amp = 0.5;
  vec3 q = p;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float v;
    gnoise(q, v);
    sum += amp * v;
    q = ROT * q * lacunarity;
    amp *= gain;
  }
  return sum;
}

// 带解析梯度的 fbm，供法线扰动使用
float fbmGrad(vec3 p, int octaves, out vec3 gradOut) {
  float sum = 0.0;
  float amp = 0.5;
  vec3 q = p;
  vec3 gradSum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float v;
    vec3 g = gnoise(q, v);
    sum += amp * v;
    gradSum += amp * g;
    q = ROT * q * 2.02;
    amp *= 0.5;
  }
  gradOut = gradSum;
  return sum;
}

// ---- Worley（F1 蜂窝）：霉斑细胞、螨虫麻点 ----
float worley(vec3 p, float jitter) {
  vec3 n = floor(p);
  vec3 f = fract(p);
  float minDist = 8.0;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 point = hash33(n + g) * jitter;
        vec3 delta = g + point - f;
        float d = dot(delta, delta);
        minDist = min(minDist, d);
      }
    }
  }
  return sqrt(minDist);
}

// F1-F2：蜂窝脊线，用于干裂纹网络
vec2 worleyF1F2(vec3 p) {
  vec3 n = floor(p);
  vec3 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 point = hash33(n + g) * 0.85;
        float d = length(g + point - f);
        if (d < f1) { f2 = f1; f1 = d; }
        else if (d < f2) { f2 = d; }
      }
    }
  }
  return vec2(f1, f2);
}

// ---- 域扭曲：让霉斑边界呈菌丝状不规则生长 ----
vec3 domainWarp(vec3 p, float strength) {
  float a;
  float b;
  gnoise(p + vec3(13.7, 7.1, 3.4), a);
  gnoise(p + vec3(4.2, 19.3, 8.8), b);
  float c;
  gnoise(p + vec3(23.1, 2.9, 11.6), c);
  return p + strength * vec3(a, b, c);
}
`
