
import React, { useContext, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeContext, TreeContextType } from '../types';

// 圣诞装饰物颜色配置
const ORNAMENT_COLORS = {
  red: { base: '#c41e3a', emissive: '#8b0000' },
  gold: { base: '#ffd700', emissive: '#b8860b' },
  green: { base: '#228b22', emissive: '#006400' },
  silver: { base: '#c0c0c0', emissive: '#808080' },
  blue: { base: '#1e90ff', emissive: '#0000cd' }
};

const CrystalOrnaments: React.FC = () => {
  const { state, rotationSpeed, panOffset } = useContext(TreeContext) as TreeContextType;
  const groupRef = useRef<THREE.Group>(null);

  const progress = useRef(0);
  const treeRotation = useRef(0);
  const currentPan = useRef({ x: 0, y: 0 });

  const ornaments = useMemo(() => {
    const count = 40; // 优化数量
    const items = [];
    
    const colorKeys = Object.keys(ORNAMENT_COLORS) as (keyof typeof ORNAMENT_COLORS)[];

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const h = t * 11 - 5.5;
      const r = (6 - (h + 5.5)) * 0.5 + 0.5;
      const angle = t * Math.PI * 13;

      // Chaos 分布 - 斐波那契球体
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      const radius = 12 + Math.random() * 8;

      const chaosPos = [
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta) * 0.7,
        radius * Math.cos(phi)
      ];

      // 装饰物类型和大小
      const typeRand = Math.random();
      const type = typeRand > 0.7 ? 'icosahedron' : typeRand > 0.4 ? 'sphere' : 'octahedron';
      
      const colorKey = colorKeys[Math.floor(Math.random() * colorKeys.length)];
      const colors = ORNAMENT_COLORS[colorKey];

      items.push({
        id: i,
        chaosPos: new THREE.Vector3(...chaosPos),
        treeCyl: { h, r, angle },
        type,
        color: colors.base,
        emissive: colors.emissive,
        scale: Math.random() * 0.18 + 0.12,
        rotationOffset: Math.random() * Math.PI * 2
      });
    }
    return items;
  }, []);

  useFrame((state3d, delta) => {
    const time = state3d.clock.elapsedTime;
    const targetProgress = state === 'FORMED' ? 1 : 0;
    progress.current = THREE.MathUtils.damp(progress.current, targetProgress, 2.5, delta);
    const p = progress.current;
    const ease = p * p * (3 - 2 * p);

    const spinFactor = state === 'FORMED' ? rotationSpeed : 0.06;
    treeRotation.current += spinFactor * delta;

    // 平滑平移
    currentPan.current.x = THREE.MathUtils.damp(currentPan.current.x, panOffset.x, 8, delta);
    currentPan.current.y = THREE.MathUtils.damp(currentPan.current.y, panOffset.y, 8, delta);

    if (groupRef.current) {
      groupRef.current.position.x = currentPan.current.x;
      groupRef.current.position.y = currentPan.current.y;

      groupRef.current.children.forEach((child, i) => {
        if (child.name === 'STAR') {
          const starY = THREE.MathUtils.lerp(12, 7.5, ease);
          child.position.set(0, starY, 0);
          child.rotation.y += delta * 0.8;
          
          // 星星脉动效果
          const pulse = 1.0 + Math.sin(time * 2.5) * 0.15 + Math.sin(time * 4) * 0.05;
          child.scale.setScalar(THREE.MathUtils.lerp(0, pulse, ease));
          return;
        }

        const data = ornaments[i];
        if (!data) return;

        const cx = data.chaosPos.x;
        const cy = data.chaosPos.y;
        const cz = data.chaosPos.z;
        const cr = Math.sqrt(cx * cx + cz * cz);
        const cAngle = Math.atan2(cz, cx);

        const { h, r, angle } = data.treeCyl;

        const y = THREE.MathUtils.lerp(cy, h, ease);
        const currentR = THREE.MathUtils.lerp(cr, r, ease);

        const vortexTwist = (1 - ease) * 12.0;
        const currentAngle = angle + vortexTwist + treeRotation.current;

        const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.15);
        const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.15);

        const tX = currentR * Math.cos(currentAngle);
        const tZ = currentR * Math.sin(currentAngle);

        child.position.x = THREE.MathUtils.lerp(cRotatedX, tX, ease);
        child.position.y = y;
        child.position.z = THREE.MathUtils.lerp(cRotatedZ, tZ, ease);

        // 自转动画 - 使用预计算的偏移
        const rotSpeed = (1 - ease) * 1.5 + 0.3;
        child.rotation.x = time * rotSpeed + (data as any).rotationOffset;
        child.rotation.y = time * rotSpeed * 0.7 + (data as any).rotationOffset;
      });
    }
  });

  return (
    <group ref={groupRef}>
      {ornaments.map((o) => (
        <mesh key={o.id} scale={o.scale * 0.8} castShadow>
          {o.type === 'sphere' && <sphereGeometry args={[1, 12, 12]} />}
          {o.type === 'icosahedron' && <icosahedronGeometry args={[1, 0]} />}
          {o.type === 'octahedron' && <octahedronGeometry args={[1, 0]} />}

          <meshStandardMaterial
            color={o.color}
            roughness={0.25}
            metalness={0.6}
            emissive={o.emissive}
            emissiveIntensity={0.4}
            envMapIntensity={0.8}
          />
        </mesh>
      ))}

      {/* 树顶星星 - 增强效果 */}
      <group name="STAR" position={[0, 7.5, 0]}>
        {/* 主星星 */}
        <mesh>
          <octahedronGeometry args={[0.35, 0]} />
          <meshStandardMaterial
            color="#ffd700"
            emissive="#ffaa00"
            emissiveIntensity={3}
            roughness={0.1}
            metalness={0.9}
            toneMapped={false}
          />
        </mesh>
        
        {/* 光晕效果 */}
        <mesh scale={1.5}>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshBasicMaterial 
            color="#ffd700" 
            transparent 
            opacity={0.2}
            depthWrite={false}
          />
        </mesh>
        
        {/* 点光源 */}
        <pointLight intensity={3} color="#ffd700" distance={12} decay={2} />
        <pointLight intensity={1} color="#ffffff" distance={6} decay={2} />
      </group>
    </group>
  );
};

export default CrystalOrnaments;
