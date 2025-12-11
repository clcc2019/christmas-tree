
import React, { useContext, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls, Stars, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, ToneMapping } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import TreeSystem from './TreeSystem';
import CrystalOrnaments from './CrystalOrnaments';
import { TreeContext, TreeContextType } from '../types';

// 雪花粒子系统 - 使用 InstancedMesh 优化性能
const Snowfall: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 800;
  
  const snowflakes = useMemo(() => {
    const positions: { x: number; y: number; z: number; speed: number; wobble: number; size: number }[] = [];
    for (let i = 0; i < count; i++) {
      positions.push({
        x: (Math.random() - 0.5) * 60,
        y: Math.random() * 40 - 10,
        z: (Math.random() - 0.5) * 60,
        speed: 0.5 + Math.random() * 1.5,
        wobble: Math.random() * Math.PI * 2,
        size: 0.02 + Math.random() * 0.04
      });
    }
    return positions;
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.elapsedTime;
    const dummy = new THREE.Object3D();
    
    snowflakes.forEach((flake, i) => {
      // 下落动画
      flake.y -= flake.speed * 0.03;
      if (flake.y < -15) {
        flake.y = 25;
        flake.x = (Math.random() - 0.5) * 60;
        flake.z = (Math.random() - 0.5) * 60;
      }
      
      // 左右飘动
      const wobbleX = Math.sin(time * 0.5 + flake.wobble) * 0.02;
      const wobbleZ = Math.cos(time * 0.3 + flake.wobble) * 0.02;
      
      dummy.position.set(flake.x + wobbleX, flake.y, flake.z + wobbleZ);
      dummy.scale.setScalar(flake.size);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
    </instancedMesh>
  );
};

// 极光效果 - 简化版本
const AuroraEffect: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color('#00ff88') },
        uColor2: { value: new THREE.Color('#0088ff') },
        uColor3: { value: new THREE.Color('#ff00ff') }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        void main() {
          float wave1 = sin(vUv.x * 3.0 + uTime * 0.3) * 0.5 + 0.5;
          float wave2 = sin(vUv.x * 5.0 - uTime * 0.2 + 1.5) * 0.5 + 0.5;
          float wave3 = sin(vUv.x * 2.0 + uTime * 0.4 + 3.0) * 0.5 + 0.5;
          
          float mask = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          mask *= smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
          
          vec3 color = mix(uColor1, uColor2, wave1);
          color = mix(color, uColor3, wave2 * 0.3);
          
          float alpha = mask * (wave1 * 0.3 + wave2 * 0.2 + wave3 * 0.1) * 0.15;
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }, []);

  useFrame((state) => {
    if (meshRef.current) {
      shaderMaterial.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 15, -30]} rotation={[0.2, 0, 0]}>
      <planeGeometry args={[80, 20, 32, 32]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
};

const Rig = () => {
  const { state, zoomOffset } = useContext(TreeContext) as TreeContextType;
  const targetRef = useRef({ z: 18, y: 0 });
  
  useFrame((state3d, delta) => {
    const t = state3d.clock.getElapsedTime();
    const baseZ = state === 'CHAOS' ? 22 : 16;
    const targetZ = Math.max(5, Math.min(baseZ + zoomOffset, 50));
    const targetY = state === 'CHAOS' ? 2 : 0;

    // 使用 damp 实现更平滑的过渡
    targetRef.current.z = THREE.MathUtils.damp(targetRef.current.z, targetZ, 3, delta);
    targetRef.current.y = THREE.MathUtils.damp(targetRef.current.y, targetY, 3, delta);

    // 更柔和的呼吸感
    const breathZ = Math.sin(t * 0.15) * 1.5;
    const breathY = Math.cos(t * 0.12) * 0.8;
    
    state3d.camera.position.z = targetRef.current.z + breathZ;
    state3d.camera.position.y = targetRef.current.y + breathY;
    state3d.camera.lookAt(0, 0, 0);
  });
  return null;
};

const Experience: React.FC = () => {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]} // 降低最大 DPR 以提升性能
      camera={{ position: [0, 0, 18], fov: 45, near: 0.1, far: 150 }}
      gl={{
        antialias: true, // 开启抗锯齿提升画质
        alpha: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
        stencil: false,
        depth: true,
        powerPreference: 'high-performance'
      }}
      performance={{ min: 0.5 }} // 自动降级以保持帧率
    >
      {/* 深邃的夜空氛围光 */}
      <ambientLight intensity={0.25} color="#0a1628" />
      
      {/* 主光源 - 温暖的顶光 */}
      <spotLight
        position={[8, 25, 12]}
        angle={0.4}
        penumbra={1}
        intensity={6}
        color="#fff5e6"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />
      
      {/* 补光 - 冷色调侧光 */}
      <pointLight position={[-15, 5, -10]} intensity={2} color="#1a4d6e" />
      
      {/* 树顶星光 */}
      <pointLight position={[0, 8, 0]} intensity={2.5} color="#ffd700" distance={15} decay={2} />
      
      {/* 底部反射光 */}
      <pointLight position={[0, -8, 5]} intensity={0.8} color="#2d5a3d" distance={20} />

      {/* 背景星空 - 优化数量 */}
      <Stars radius={80} depth={60} count={2000} factor={5} saturation={0.2} fade speed={0.8} />

      {/* 极光效果 */}
      <AuroraEffect />

      {/* 雪花 */}
      <Snowfall />

      {/* 优化后的闪烁星星 - 减少数量提升性能 */}
      <Sparkles count={150} scale={35} size={3} speed={0.2} opacity={0.7} color="#ffd700" />
      <Sparkles count={100} scale={40} size={2} speed={0.15} opacity={0.5} color="#ffffff" />
      <Sparkles count={80} scale={30} size={2.5} speed={0.4} opacity={0.4} color="#ff6b6b" />
      <Sparkles count={80} scale={30} size={2.5} speed={0.35} opacity={0.4} color="#4ecdc4" />

      {/* 环境贴图 - 使用更暗的预设 */}
      <Environment preset="night" environmentIntensity={0.3} />

      {/* 雾气效果 - 增加深度感 */}
      <fog attach="fog" args={['#0a0a15', 30, 80]} />

      {/* 主内容 */}
      <group position={[0, -2, 0]}>
        <TreeSystem />
        <CrystalOrnaments />
      </group>

      {/* 控制器 */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={8}
        maxDistance={45}
        maxPolarAngle={Math.PI / 1.5}
        minPolarAngle={Math.PI / 6}
        target={[0, 2, 0]}
        enableDamping
        dampingFactor={0.05}
      />
      <Rig />

      {/* 后处理 - 优化效果 */}
      <EffectComposer multisampling={0}>
        <Bloom
          luminanceThreshold={0.8}
          mipmapBlur
          intensity={0.8}
          radius={0.6}
          levels={6}
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0005, 0.0005)}
        />
        <Vignette eskil={false} offset={0.15} darkness={0.9} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
};

export default Experience;
