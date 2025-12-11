
import React, { useRef, useMemo, useContext, useState, useEffect } from 'react';
import { useFrame, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial, Text, Line } from '@react-three/drei';
import * as random from 'maath/random/dist/maath-random.esm';
import { TreeContext, ParticleData, TreeContextType } from '../types';

// 纹理缓存管理器
const textureCache = new Map<string, THREE.Texture>();
const loadingPromises = new Map<string, Promise<THREE.Texture>>();

const loadTextureWithCache = (url: string, loader: THREE.TextureLoader): Promise<THREE.Texture> => {
  if (textureCache.has(url)) {
    return Promise.resolve(textureCache.get(url)!);
  }
  
  if (loadingPromises.has(url)) {
    return loadingPromises.get(url)!;
  }
  
  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
        textureCache.set(url, tex);
        loadingPromises.delete(url);
        resolve(tex);
      },
      undefined,
      reject
    );
  });
  
  loadingPromises.set(url, promise);
  return promise;
};

// 优化后的树叶材质 - 更丰富的颜色变化
const FoliageMaterial = shaderMaterial(
  { 
    uTime: 0, 
    uColor: new THREE.Color('#0d4a26'), 
    uColorAccent: new THREE.Color('#22c55e'),
    uColorHighlight: new THREE.Color('#86efac'),
    uPixelRatio: 1 
  },
  /* glsl */ `
    uniform float uTime;
    uniform float uPixelRatio;
    attribute float size;
    varying vec3 vPosition;
    varying float vBlink;
    varying float vDepth;
    
    vec3 curl(float x, float y, float z) {
      float eps = 1.0;
      vec3 c = vec3(0.0);
      float n1, n2;
      x /= eps; y /= eps; z /= eps;
      n1 = sin(y + cos(z + uTime * 0.5));
      n2 = cos(x + sin(z + uTime * 0.5));
      c.x = n1 - n2;
      n1 = sin(z + cos(x + uTime * 0.5));
      n2 = cos(y + sin(x + uTime * 0.5));
      c.y = n1 - n2;
      n1 = sin(x + cos(y + uTime * 0.5));
      n2 = cos(z + sin(y + uTime * 0.5));
      c.z = n1 - n2;
      return c * 0.08;
    }
    
    void main() {
      vPosition = position;
      vec3 distortedPosition = position + curl(position.x, position.y, position.z);
      vec4 mvPosition = modelViewMatrix * vec4(distortedPosition, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = size * uPixelRatio * (55.0 / -mvPosition.z);
      vBlink = sin(uTime * 1.5 + position.y * 4.0 + position.x * 2.0);
      vDepth = -mvPosition.z;
    }
  `,
  /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uColorAccent;
    uniform vec3 uColorHighlight;
    varying float vBlink;
    varying float vDepth;
    
    void main() {
      vec2 xy = gl_PointCoord.xy - vec2(0.5);
      float ll = length(xy);
      if (ll > 0.5) discard;
      
      float strength = pow(1.0 - ll * 2.0, 2.5);
      
      // 三色渐变
      vec3 color = mix(uColor, uColorAccent, smoothstep(-0.6, 0.6, vBlink));
      color = mix(color, uColorHighlight, smoothstep(0.7, 1.0, vBlink) * 0.5);
      
      // 深度雾化
      float fogFactor = smoothstep(5.0, 35.0, vDepth);
      color = mix(color, vec3(0.02, 0.05, 0.08), fogFactor * 0.4);
      
      gl_FragColor = vec4(color, strength * 0.9);
    }
  `
);
extend({ FoliageMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    foliageMaterial: any
    shimmerMaterial: any
  }
}

// --- 优化后的扫光材质 ---
const ShimmerMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color('#ffffff'), uIntensity: 0.08 },
  /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uIntensity;
    varying vec2 vUv;
    
    void main() {
      // 双向扫光效果
      float pos1 = mod(uTime * 0.6, 3.0) - 0.5;
      float pos2 = mod(uTime * 0.4 + 1.5, 3.0) - 0.5;
      
      float bar1 = smoothstep(0.0, 0.15, 0.15 - abs(vUv.x + vUv.y * 0.5 - pos1));
      float bar2 = smoothstep(0.0, 0.1, 0.1 - abs(vUv.x - vUv.y * 0.3 - pos2)) * 0.5;
      
      float alpha = (bar1 + bar2) * uIntensity;
      
      gl_FragColor = vec4(uColor, alpha);
    }
  `
);
extend({ ShimmerMaterial });

// --- 优化后的照片组件 ---
const PolaroidPhoto: React.FC<{ 
  url: string; 
  position: THREE.Vector3; 
  rotation: THREE.Euler; 
  scale: number; 
  id: string; 
  shouldLoad: boolean; 
  year: number;
  isSelected?: boolean;
}> = React.memo(({ url, position, rotation, scale, id, shouldLoad, year, isSelected }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [loadStatus, setLoadStatus] = useState<'pending' | 'loading' | 'loaded' | 'error'>('pending');
  const loaderRef = useRef<THREE.TextureLoader | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  
  // 悬停动画
  const hoverScale = useRef(1);
  
  useFrame((_, delta) => {
    if (groupRef.current) {
      const targetScale = isSelected ? 1.15 : 1;
      hoverScale.current = THREE.MathUtils.lerp(hoverScale.current, targetScale, delta * 8);
      groupRef.current.scale.setScalar(scale * 1.2 * hoverScale.current);
    }
  });

  useEffect(() => {
    if (!shouldLoad || loadStatus !== 'pending') return;

    setLoadStatus('loading');
    
    if (!loaderRef.current) {
      loaderRef.current = new THREE.TextureLoader();
    }
    
    const loader = loaderRef.current;

    // 使用缓存加载
    loadTextureWithCache(url, loader)
      .then((tex) => {
        setTexture(tex);
        setLoadStatus('loaded');
      })
      .catch(() => {
        // 回退到随机图片
        const seed = id.split('-')[1] || '55';
        const fallbackUrl = `https://picsum.photos/seed/${parseInt(seed) + 100}/400/500`;
        
        loadTextureWithCache(fallbackUrl, loader)
          .then((tex) => {
            setTexture(tex);
            setLoadStatus('loaded');
          })
          .catch(() => {
            setLoadStatus('error');
          });
      });
  }, [url, id, shouldLoad, loadStatus]);

  // 相框材质 - 使用 useMemo 缓存
  const frameMaterial = useMemo(() => (
    <meshStandardMaterial
      color="#fafafa"
      roughness={0.15}
      metalness={0.05}
      envMapIntensity={0.3}
    />
  ), []);

  // 照片材质
  const photoMaterial = useMemo(() => {
    if (!texture) {
      return <meshStandardMaterial color="#1a1a1a" roughness={0.8} />;
    }
    return (
      <meshStandardMaterial
        map={texture}
        roughness={0.4}
        metalness={0.0}
        envMapIntensity={0.2}
      />
    );
  }, [texture]);

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* 相框阴影 */}
      <mesh position={[0.02, -0.02, -0.01]}>
        <boxGeometry args={[1.02, 1.27, 0.01]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.15} />
      </mesh>
      
      {/* 相框边框 */}
      <mesh position={[0, 0, 0]} userData={{ photoId: id, photoUrl: url }}>
        <boxGeometry args={[1, 1.25, 0.025]} />
        {frameMaterial}
      </mesh>
      
      {/* 照片内容 */}
      <mesh position={[0, 0.15, 0.018]} userData={{ photoId: id, photoUrl: url }}>
        <planeGeometry args={[0.88, 0.88]} />
        {photoMaterial}
      </mesh>
      
      {/* 扫光效果 */}
      <mesh position={[0, 0.15, 0.025]} scale={[0.88, 0.88, 1]}>
        <planeGeometry args={[1, 1]} />
        <shimmerMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      
      {/* 加载指示器 */}
      {loadStatus === 'loading' && (
        <mesh position={[0, 0.15, 0.03]}>
          <ringGeometry args={[0.08, 0.12, 16]} />
          <meshBasicMaterial color="#ffd700" transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
});

// --- Main Tree System ---
const TreeSystem: React.FC = () => {
  const { state, rotationSpeed, rotationBoost, pointer, clickTrigger, setSelectedPhotoUrl, selectedPhotoUrl, panOffset } = useContext(TreeContext) as TreeContextType;
  const { camera } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  const lightsRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const progress = useRef(0);
  const treeRotation = useRef(0);

  // 用于平滑过渡 Pan
  const currentPan = useRef({ x: 0, y: 0 });

  // 渐进式加载状态
  const [loadedCount, setLoadedCount] = useState(0);

  const [photoObjects, setPhotoObjects] = useState<{ 
    id: string; 
    url: string; 
    ref: React.MutableRefObject<THREE.Group | null>; 
    data: ParticleData; 
    pos: THREE.Vector3; 
    rot: THREE.Euler; 
    scale: number; 
  }[]>([]);

  // 优化：使用 requestIdleCallback 进行渐进式加载
  useEffect(() => {
    if (loadedCount >= photoObjects.length) return;
    
    const loadNext = () => {
      setLoadedCount(prev => Math.min(prev + 2, photoObjects.length)); // 每次加载2张
    };
    
    // 使用 requestIdleCallback 在空闲时加载，否则使用 setTimeout
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(loadNext, { timeout: 150 });
      return () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(loadNext, 80);
      return () => clearTimeout(id);
    }
  }, [loadedCount, photoObjects.length]);

  // --- Data Generation ---
  const { foliageData, photosData, lightsData } = useMemo(() => {
    const particleCount = 4500;
    const foliage = new Float32Array(particleCount * 3); const foliageChaos = new Float32Array(particleCount * 3); const foliageTree = new Float32Array(particleCount * 3); const sizes = new Float32Array(particleCount);
    const sphere = random.inSphere(new Float32Array(particleCount * 3), { radius: 18 }); for (let i = 0; i < particleCount * 3; i++) foliageChaos[i] = sphere[i];
    for (let i = 0; i < particleCount; i++) { const i3 = i * 3; const h = Math.random() * 14; const coneRadius = (14 - h) * 0.45; const angle = h * 3.0 + Math.random() * Math.PI * 2; foliageTree[i3] = Math.cos(angle) * coneRadius; foliageTree[i3 + 1] = h - 6; foliageTree[i3 + 2] = Math.sin(angle) * coneRadius; sizes[i] = Math.random() * 1.5 + 0.5; }

    const lightCount = 300;
    const lightChaos = new Float32Array(lightCount * 3); const lightTree = new Float32Array(lightCount * 3); const lSphere = random.inSphere(new Float32Array(lightCount * 3), { radius: 20 });
    for (let i = 0; i < lightCount * 3; i++) lightChaos[i] = lSphere[i];
    for (let i = 0; i < lightCount; i++) { const i3 = i * 3; const t = i / lightCount; const h = t * 13; const coneRadius = (14 - h) * 0.48; const angle = t * Math.PI * 25; lightTree[i3] = Math.cos(angle) * coneRadius; lightTree[i3 + 1] = h - 6; lightTree[i3 + 2] = Math.sin(angle) * coneRadius; }

    // 实际存在的照片文件列表
    const photoFiles = [
      "2024_06_1.jpg", "2024_07_1.jpg", "2024_07_2.jpg",
      "2024_09_1.jpg", "2024_09_2.jpg", "2024_09_3.jpg",
      "2024_09_4.jpg", "2024_09_5.jpg", "2024_09_6.jpg",
      "2024_10_1.jpg", "2024_11_1.jpg", "2024_12_1.jpg",
      "2024_12_2.jpg", "2024_12_3.jpg", "2025_01_1.jpg",
      "2025_01_2.jpg", "2025_01_3.jpg", "2025_01_4.jpg",
      "2025_01_5.jpg", "2025_01_6.jpg", "2025_01_7.jpg",
      "2025_02_1.jpg", "2025_05_1.jpg", "2025_06_1.jpg",
      "2025_06_2.jpg", "2025_06_3.jpg", "2025_09_1.jpg",
      "2025_10_1.jpg", "2025_10_2.jpg", "2025_11_1.jpg",
      "2025_11_2.jpg"
    ];

    // 按时间排序
    photoFiles.sort();

    const photoCount = photoFiles.length;
    const photos: ParticleData[] = [];

    for (let i = 0; i < photoCount; i++) {
      const fileName = photoFiles[i];
      // 解析文件名: YYYY_MM_ID.jpg
      const parts = fileName.split('_');
      const year = parseInt(parts[0]);
      const month = parts[1]; // Keep as string "02"

      // --- FORMED: Time Spiral Layout ---
      // 螺旋上升: i 越大 (越新)，h 越高
      const t = i / (photoCount - 1);
      const h = t * 14 - 7; // 高度范围 -7 到 7
      const radius = (7 - (h + 7)) * 0.4 + 1.5; // 树锥形半径
      const angle = t * Math.PI * 10; // 螺旋圈数 (5圈)

      const treeX = Math.cos(angle) * radius;
      const treeY = h;
      const treeZ = Math.sin(angle) * radius;

      // --- CHAOS: Fibonacci Sphere Layout (Even Distribution) ---
      // 使用斐波那契球体分布，确保照片均匀分布，减少重叠

      // 黄金角度
      const phi = Math.acos(1 - 2 * (i + 0.5) / photoCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

      // 基础半径 (稍微随机化一点，避免完全在一个球面上)
      const r = 12 + Math.random() * 4;

      const chaosX = r * Math.sin(phi) * Math.cos(theta);
      const chaosY = r * Math.sin(phi) * Math.sin(theta) * 0.6; // Y轴压扁一点，形成椭球
      const chaosZ = r * Math.cos(phi);

      const imageUrl = `/photos/${fileName}`;

      photos.push({
        id: `photo-${i}`,
        type: 'PHOTO',
        year: year,
        month: month,
        chaosPos: [chaosX, chaosY, chaosZ],
        treePos: [treeX, treeY, treeZ],
        chaosRot: [
          (Math.random() - 0.5) * 0.2, // X: 微小随机倾斜
          0 + (Math.random() - 0.5) * 0.2, // Y: 正面朝向 (0) + 微扰
          (Math.random() - 0.5) * 0.1 // Z: 微小倾斜
        ],
        treeRot: [0, -angle + Math.PI / 2, 0], // 面向外
        scale: 0.9 + Math.random() * 0.3,
        image: imageUrl,
        color: 'white'
      });
    }
    return { foliageData: { current: foliage, chaos: foliageChaos, tree: foliageTree, sizes }, photosData: photos, lightsData: { chaos: lightChaos, tree: lightTree, count: lightCount } };
  }, []);

  useEffect(() => {
    setPhotoObjects(photosData.map(p => ({ id: p.id, url: p.image!, ref: React.createRef(), data: p, pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: p.scale })));
  }, [photosData]);

  // --- 处理点击事件 ---
  // --- 处理点击事件 (Screen-Space Distance Selection) ---
  const photoOpenTimeRef = useRef<number>(0);

  useEffect(() => {
    if (state === 'CHAOS' && pointer) {
      // 如果已经有选中的照片，检查是否需要关闭
      if (selectedPhotoUrl) {
        // 检查锁定时间 (增加到 3 秒)
        if (Date.now() - photoOpenTimeRef.current < 3000) {
          return; // 锁定期间禁止关闭
        }

        // 点击任意位置关闭 (除了照片本身，但这里简化为再次点击关闭)
        // 实际上 App.tsx 里的 PhotoModal 遮罩层点击也会触发 setSelectedPhotoUrl(null)
        // 这里主要处理点击"空地"的情况

        // 重新计算是否点到了照片 (为了避免误触关闭)
        // 但根据需求"单指照片可以精准选中并关闭了"，说明用户希望点击照片也能关闭?
        // 现在的逻辑是: 如果有点到照片 -> 切换; 如果没点到 -> 关闭

        // 让我们简化逻辑: 只要过了2秒，点击任何地方都尝试关闭或切换
        // 但为了防止误触，我们还是检测一下

        // ... (保持原有检测逻辑，但增加关闭逻辑)
      }

      // 1. 转换 Pointer 到 NDC (-1 to 1)
      const ndcX = pointer.x * 2 - 1;
      const ndcY = -(pointer.y * 2) + 1;

      // 2. 遍历所有照片，计算屏幕空间距离
      let closestPhotoId: string | null = null;
      let minDistance = Infinity;
      const SELECTION_THRESHOLD = 0.05; // Reduced from 0.15 to 0.05 for higher precision

      photoObjects.forEach(obj => {
        if (!obj.ref.current) return;

        // 获取照片世界坐标
        const worldPos = new THREE.Vector3();
        obj.ref.current.getWorldPosition(worldPos);

        // 投影到屏幕空间
        const screenPos = worldPos.clone().project(camera);

        // 检查是否在相机前方 (z < 1)
        if (screenPos.z < 1) {
          // 计算 NDC 距离
          const dist = Math.hypot(screenPos.x - ndcX, screenPos.y - ndcY);

          if (dist < SELECTION_THRESHOLD && dist < minDistance) {
            minDistance = dist;
            closestPhotoId = obj.data.image!;
          }
        }
      });

      if (closestPhotoId) {
        // 如果点击的是当前照片，且过了锁定时间 -> 关闭
        if (selectedPhotoUrl === closestPhotoId) {
          if (Date.now() - photoOpenTimeRef.current > 3000) {
            setSelectedPhotoUrl(null);
          }
        } else {
          // 选中新照片
          setSelectedPhotoUrl(closestPhotoId);
          photoOpenTimeRef.current = Date.now(); // 记录打开时间
        }
      } else if (selectedPhotoUrl) {
        // Clicked on empty space -> Close photo (if not locked)
        if (Date.now() - photoOpenTimeRef.current > 3000) {
          setSelectedPhotoUrl(null);
        }
      }
    }
  }, [clickTrigger]); // Remove selectedPhotoUrl dependency to avoid double-firing loop

  // 缓存 dummy 对象避免每帧创建
  const dummyRef = useRef(new THREE.Object3D());
  
  // --- 优化后的动画循环 ---
  useFrame((state3d, delta) => {
    const time = state3d.clock.getElapsedTime();
    const targetProgress = state === 'FORMED' ? 1 : 0;
    
    // 使用 damp 实现更平滑的过渡
    progress.current = THREE.MathUtils.damp(progress.current, targetProgress, 2.5, delta);
    const ease = progress.current * progress.current * (3 - 2 * progress.current);
    
    // 旋转速度衰减
    const currentRotationSpeed = state === 'FORMED' ? (rotationSpeed + rotationBoost) : 0.08;
    treeRotation.current += currentRotationSpeed * delta;

    // 平滑平移
    currentPan.current.x = THREE.MathUtils.damp(currentPan.current.x, panOffset.x, 8, delta);
    currentPan.current.y = THREE.MathUtils.damp(currentPan.current.y, panOffset.y, 8, delta);

    if (groupRef.current) {
      groupRef.current.position.x = currentPan.current.x;
      groupRef.current.position.y = currentPan.current.y;
    }

    // 更新粒子系统
    if (pointsRef.current) {
      const material = pointsRef.current.material as any;
      if (material.uniforms) {
        material.uniforms.uTime.value = time;
      }
      
      const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
      const len = positions.length / 3;
      
      for (let i = 0; i < len; i++) {
        const i3 = i * 3;
        const cx = foliageData.chaos[i3], cy = foliageData.chaos[i3 + 1], cz = foliageData.chaos[i3 + 2];
        const tx = foliageData.tree[i3], ty = foliageData.tree[i3 + 1], tz = foliageData.tree[i3 + 2];
        
        const y = THREE.MathUtils.lerp(cy, ty, ease);
        const tr = Math.sqrt(tx * tx + tz * tz);
        const tAngle = Math.atan2(tz, tx);
        const cr = Math.sqrt(cx * cx + cz * cz);
        const r = THREE.MathUtils.lerp(cr, tr, ease);
        
        const vortexTwist = (1 - ease) * 15.0;
        const currentAngle = tAngle + vortexTwist + treeRotation.current;
        const formedX = r * Math.cos(currentAngle);
        const formedZ = r * Math.sin(currentAngle);
        
        const cAngle = Math.atan2(cz, cx);
        const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.5);
        const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.5);
        
        positions[i3] = THREE.MathUtils.lerp(cRotatedX, formedX, ease);
        positions[i3 + 1] = y;
        positions[i3 + 2] = THREE.MathUtils.lerp(cRotatedZ, formedZ, ease);
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
    
    // 更新灯光实例
    if (lightsRef.current) {
      const dummy = dummyRef.current;
      
      for (let i = 0; i < lightsData.count; i++) {
        const i3 = i * 3;
        const cx = lightsData.chaos[i3], cy = lightsData.chaos[i3 + 1], cz = lightsData.chaos[i3 + 2];
        const tx = lightsData.tree[i3], ty = lightsData.tree[i3 + 1], tz = lightsData.tree[i3 + 2];
        
        const y = THREE.MathUtils.lerp(cy, ty, ease);
        const tr = Math.sqrt(tx * tx + tz * tz);
        const tAngle = Math.atan2(tz, tx);
        const cr = Math.sqrt(cx * cx + cz * cz);
        const r = THREE.MathUtils.lerp(cr, tr, ease);
        
        const vortexTwist = (1 - ease) * 12.0;
        const currentAngle = tAngle + vortexTwist + treeRotation.current;
        
        const cAngle = Math.atan2(cz, cx);
        const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.3);
        const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.3);
        
        const fx = THREE.MathUtils.lerp(cRotatedX, r * Math.cos(currentAngle), ease);
        const fz = THREE.MathUtils.lerp(cRotatedZ, r * Math.sin(currentAngle), ease);
        
        // 添加闪烁效果
        const blink = 0.8 + Math.sin(time * 3 + i * 0.5) * 0.2;
        
        dummy.position.set(fx, y, fz);
        dummy.scale.setScalar(blink);
        dummy.updateMatrix();
        lightsRef.current.setMatrixAt(i, dummy.matrix);
      }
      lightsRef.current.instanceMatrix.needsUpdate = true;
    }
    
    // 批量更新扫光材质时间
    const shimmerTime = time;
    photoObjects.forEach((obj, idx) => {
      if (!obj.ref.current) return;
      
      obj.ref.current.traverse((child: any) => {
        if (child.material?.uniforms?.uTime) {
          child.material.uniforms.uTime.value = shimmerTime + idx * 0.3;
        }
      });
    });
    
    // 更新树干
    if (trunkRef.current) {
      const trunkScale = THREE.MathUtils.smoothstep(ease, 0.3, 1.0);
      trunkRef.current.scale.set(trunkScale, ease, trunkScale);
      trunkRef.current.position.y = 1;
      trunkRef.current.rotation.y = treeRotation.current;
    }
    
    // 更新照片位置
    photoObjects.forEach((obj) => {
      if (!obj.ref.current) return;
      
      const { chaosPos, treePos, chaosRot, treeRot } = obj.data;
      const [cx, cy, cz] = chaosPos;
      const [tx, ty, tz] = treePos;
      
      const y = THREE.MathUtils.lerp(cy, ty, ease);
      const cr = Math.sqrt(cx * cx + cz * cz);
      const tr = Math.sqrt(tx * tx + tz * tz);
      const r = THREE.MathUtils.lerp(cr, tr, ease);
      
      const tAngle = Math.atan2(tz, tx);
      const vortexTwist = (1 - ease) * 10.0;
      const currentAngle = tAngle + vortexTwist + treeRotation.current;
      
      const cAngle = Math.atan2(cz, cx);
      const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.2);
      const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.2);
      
      const targetX = r * Math.cos(currentAngle);
      const targetZ = r * Math.sin(currentAngle);
      
      obj.ref.current.position.set(
        THREE.MathUtils.lerp(cRotatedX, targetX, ease),
        y,
        THREE.MathUtils.lerp(cRotatedZ, targetZ, ease)
      );
      
      const lookAtAngle = -currentAngle + Math.PI / 2;
      obj.ref.current.rotation.x = THREE.MathUtils.lerp(chaosRot[0], treeRot[0], ease);
      obj.ref.current.rotation.y = THREE.MathUtils.lerp(chaosRot[1], lookAtAngle, ease);
      obj.ref.current.rotation.z = THREE.MathUtils.lerp(chaosRot[2], treeRot[2], ease);
    });
  });

  // 优化：缓存时间线点
  const timelinePoints = useMemo(() => 
    photoObjects.map(obj => new THREE.Vector3(...obj.data.treePos)),
    [photoObjects]
  );

  return (
    <group ref={groupRef}>
      {/* 树干 - 优化几何体 */}
      <mesh ref={trunkRef} position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.8, 14, 12]} />
        <meshStandardMaterial 
          color="#2d1810" 
          roughness={0.95} 
          metalness={0.05}
          envMapIntensity={0.1}
        />
      </mesh>
      
      {/* 树叶粒子系统 */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute 
            attach="attributes-position" 
            count={foliageData.current.length / 3} 
            array={foliageData.current} 
            itemSize={3} 
          />
          <bufferAttribute 
            attach="attributes-size" 
            count={foliageData.sizes.length} 
            array={foliageData.sizes} 
            itemSize={1} 
          />
        </bufferGeometry>
        <foliageMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      
      {/* 彩灯 - 使用 InstancedMesh */}
      <instancedMesh ref={lightsRef} args={[undefined, undefined, lightsData.count]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial 
          color="#fff8e7" 
          emissive="#ffcc00" 
          emissiveIntensity={4} 
          toneMapped={false}
        />
      </instancedMesh>
      
      {/* 照片 */}
      {photoObjects.map((obj, index) => (
        <group key={obj.id} ref={(el) => { obj.ref.current = el; }}>
          <PolaroidPhoto
            url={obj.url}
            position={obj.pos}
            rotation={obj.rot}
            scale={obj.scale}
            id={obj.id}
            shouldLoad={index < loadedCount}
            year={obj.data.year!}
            isSelected={selectedPhotoUrl === obj.url}
          />

          {/* 年份标签 - 仅在每年第一张照片显示 */}
          {obj.data.year && (index === 0 || photoObjects[index - 1].data.year !== obj.data.year) && (
            <group position={[0, 0.72, 0.05]}>
              {/* 阴影层 */}
              <Text
                position={[0.008, -0.008, -0.005]}
                fontSize={0.16}
                maxWidth={1.2}
                color="#000000"
                font="/fonts/Cinzel-Bold.ttf"
                characters="0123456789-"
                anchorX="center"
                anchorY="bottom"
                fillOpacity={0.4}
              >
                {`${obj.data.year}-${obj.data.month}`}
              </Text>
              {/* 主文字层 */}
              <Text
                fontSize={0.16}
                maxWidth={1.2}
                color="#ffd700"
                font="/fonts/Cinzel-Bold.ttf"
                characters="0123456789-"
                anchorX="center"
                anchorY="bottom"
                fillOpacity={state === 'FORMED' ? 1 : 0.85}
                outlineWidth={0.005}
                outlineColor="#8b6914"
              >
                {`${obj.data.year}-${obj.data.month}`}
              </Text>
            </group>
          )}
        </group>
      ))}

      {/* 时间线连接 - 仅在 FORMED 状态显示 */}
      {state === 'FORMED' && timelinePoints.length > 1 && (
        <Line
          points={timelinePoints}
          color="#ffd700"
          opacity={0.25}
          transparent
          lineWidth={1.5}
        />
      )}
    </group>
  );
};

export default TreeSystem;
