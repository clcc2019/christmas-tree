import React, { useMemo } from 'react';

// 预计算粒子位置，避免每次渲染重新计算
const generateParticles = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    width: 2 + Math.random() * 3,
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 10 + Math.random() * 15,
    colorType: i % 4
  }));
};

const TechEffects: React.FC = React.memo(() => {
  // 使用 useMemo 缓存粒子数据
  const particles = useMemo(() => generateParticles(12), []);
  
  return (
    <div className="fixed inset-0 pointer-events-none z-20">
      {/* HUD 边框 - 圣诞主题配色 */}
      <div className="absolute inset-0">
        {/* 四角装饰 */}
        {[
          { pos: 'top-3 left-3', borderPos: 'top-0 left-0', borderDir: 'border-t-2 border-l-2', gradX: 'to-r', gradY: 'to-b' },
          { pos: 'top-3 right-3', borderPos: 'top-0 right-0', borderDir: 'border-t-2 border-r-2', gradX: 'to-l', gradY: 'to-b' },
          { pos: 'bottom-3 left-3', borderPos: 'bottom-0 left-0', borderDir: 'border-b-2 border-l-2', gradX: 'to-r', gradY: 'to-t' },
          { pos: 'bottom-3 right-3', borderPos: 'bottom-0 right-0', borderDir: 'border-b-2 border-r-2', gradX: 'to-l', gradY: 'to-t' }
        ].map((corner, i) => (
          <div key={i} className={`absolute ${corner.pos} w-20 h-20`}>
            <div 
              className={`absolute ${corner.borderPos.split(' ')[0]} ${corner.borderPos.split(' ')[1]} w-full h-[1px]`}
              style={{ background: `linear-gradient(${corner.gradX}, rgba(34,197,94,0.6) 0%, transparent 100%)` }}
            />
            <div 
              className={`absolute ${corner.borderPos.split(' ')[0]} ${corner.borderPos.split(' ')[1]} h-full w-[1px]`}
              style={{ background: `linear-gradient(${corner.gradY}, rgba(34,197,94,0.6) 0%, transparent 100%)` }}
            />
            <div className={`absolute ${corner.borderPos} w-2.5 h-2.5 ${corner.borderDir} border-emerald-400/70 animate-pulse`} />
          </div>
        ))}

        {/* HUD 状态指示 */}
        <div className="absolute top-5 left-28 hidden md:flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400/50 font-mono text-[9px] tracking-[0.15em]">
            SYSTEM ACTIVE
          </span>
        </div>
        <div className="absolute top-5 right-28 hidden md:flex items-center gap-2">
          <span className="text-amber-400/50 font-mono text-[9px] tracking-[0.15em]">
            GESTURE TRACKING
          </span>
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        </div>
      </div>

      {/* 网格背景 - 更细腻 */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(34, 197, 94, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 197, 94, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* 浮动粒子 */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full animate-float"
            style={{
              width: `${p.width}px`,
              height: `${p.width}px`,
              background: p.colorType === 0
                ? 'radial-gradient(circle, rgba(255, 215, 0, 0.2) 0%, transparent 70%)'
                : p.colorType === 1
                ? 'radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)'
                : p.colorType === 2
                ? 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%)',
              left: `${p.left}%`,
              top: `${p.top}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      </div>

      {/* 边缘晕影 - 圣诞氛围 */}
      <div 
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.3) 100%),
            radial-gradient(ellipse at top, rgba(34,197,94,0.03) 0%, transparent 50%),
            radial-gradient(ellipse at bottom, rgba(239,68,68,0.03) 0%, transparent 50%)
          `
        }}
      />
    </div>
  );
});

export default TechEffects;
