import React, { useState, Suspense, useContext, useEffect, useRef, useMemo } from 'react';
import { TreeContextType, AppState, TreeContext, PointerCoords } from './types';
import Experience from './components/Experience';
import GestureInput from './components/GestureInput';
import TechEffects from './components/TechEffects';
import { AnimatePresence, motion } from 'framer-motion';


// --- 优化后的梦幻光标组件 ---
const DreamyCursor: React.FC<{ pointer: PointerCoords | null, progress: number }> = React.memo(({ pointer, progress }) => {
    if (!pointer) return null;
    
    const isActive = progress > 0.8;
    
    return (
        <motion.div
            className="fixed top-0 left-0 pointer-events-none z-[200]"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
                opacity: 1,
                scale: 1,
                left: `${pointer.x * 100}%`,
                top: `${pointer.y * 100}%`
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.08, ease: "easeOut" }}
            style={{ x: "-50%", y: "-50%" }}
        >
            {/* 核心光点 */}
            <div 
                className="rounded-full transition-all duration-200"
                style={{
                    width: isActive ? '16px' : '10px',
                    height: isActive ? '16px' : '10px',
                    background: isActive 
                        ? 'radial-gradient(circle, #34d399 0%, #10b981 100%)' 
                        : 'radial-gradient(circle, #fcd34d 0%, #f59e0b 100%)',
                    boxShadow: isActive 
                        ? '0 0 20px #34d399, 0 0 40px #34d39980' 
                        : '0 0 15px #fcd34d, 0 0 30px #fcd34d80'
                }}
            />

            {/* 外圈光环 */}
            <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full animate-spin-slow"
                style={{
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'radial-gradient(circle, transparent 60%, rgba(255,215,0,0.05) 100%)'
                }}
            />

            {/* 进度圆环 */}
            <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 -rotate-90 overflow-visible">
                <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#22c55e" />
                        <stop offset="50%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                    <filter id="glowFilter">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <circle
                    cx="24" cy="24" r="20"
                    fill="none"
                    stroke="url(#progressGradient)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray="125.6"
                    strokeDashoffset={125.6 * (1 - progress)}
                    filter="url(#glowFilter)"
                    style={{ transition: 'stroke-dashoffset 0.05s linear' }}
                />
            </svg>

            {/* 光晕背景 */}
            <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full blur-xl animate-pulse"
                style={{
                    background: `radial-gradient(circle, ${isActive ? 'rgba(34,197,94,0.2)' : 'rgba(251,191,36,0.15)'} 0%, transparent 70%)`
                }}
            />
        </motion.div>
    );
});

// --- 优化后的照片弹窗 ---
const PhotoModal: React.FC<{ url: string | null, onClose: () => void }> = React.memo(({ url, onClose }) => {
    if (!url) return null;
    
    return (
        <motion.div
            id="photo-modal-backdrop"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12"
            style={{
                background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.95) 100%)',
                backdropFilter: 'blur(8px)'
            }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.85, y: 40, rotateX: 10 }}
                animate={{ scale: 1, y: 0, rotateX: 0 }}
                exit={{ scale: 0.7, opacity: 0, y: 60 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
                className="relative max-w-4xl max-h-full"
                style={{
                    perspective: '1000px'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 相框容器 */}
                <div 
                    className="relative bg-white p-3 md:p-4 rounded-sm"
                    style={{
                        boxShadow: `
                            0 0 60px rgba(255,215,0,0.3),
                            0 25px 50px rgba(0,0,0,0.5),
                            inset 0 0 0 1px rgba(255,255,255,0.1)
                        `
                    }}
                >
                    {/* 照片 */}
                    <img 
                        src={url} 
                        alt="Memory" 
                        className="max-h-[75vh] object-contain rounded-sm"
                        style={{
                            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.1)'
                        }}
                    />
                    
                    {/* 装饰角标 */}
                    <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-amber-400/50" />
                    <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-amber-400/50" />
                    <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-amber-400/50" />
                    <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-amber-400/50" />
                </div>
                
                {/* 提示文字 */}
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="absolute -bottom-10 w-full text-center"
                >
                    <span className="text-amber-200/60 cinzel text-xs tracking-widest">
                        ✨ PRECIOUS MOMENT ✨
                    </span>
                </motion.div>
            </motion.div>
        </motion.div>
    );
})

// 加载动画组件
const LoadingScreen: React.FC = () => (
    <div className="flex flex-col items-center justify-center h-full gap-6">
        <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="text-6xl"
        >
            🎄
        </motion.div>
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center gap-2"
        >
            <span className="text-amber-200/90 cinzel text-xl tracking-widest">
                Loading Christmas Magic
            </span>
            <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                    <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full bg-amber-400"
                        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    />
                ))}
            </div>
        </motion.div>
    </div>
);

const AppContent: React.FC = () => {
    const { state, webcamEnabled, pointer, hoverProgress, selectedPhotoUrl, setSelectedPhotoUrl, clickTrigger } = useContext(TreeContext) as TreeContextType;

    useEffect(() => {
        if (selectedPhotoUrl && pointer) {
            const x = pointer.x * window.innerWidth;
            const y = pointer.y * window.innerHeight;
            const element = document.elementFromPoint(x, y);
            if (element) {
                const isImage = element.tagName === 'IMG';
                const isBackdrop = element.id === 'photo-modal-backdrop';
                if (isBackdrop || isImage) setSelectedPhotoUrl(null);
            }
        }
    }, [clickTrigger, selectedPhotoUrl, pointer, setSelectedPhotoUrl]);

    return (
        <main className="relative w-full h-screen bg-black text-white overflow-hidden cursor-none">
            {/* 摄像头背景层 */}
            {webcamEnabled && <GestureInput />}

            {/* 3D 场景层 */}
            <div className="absolute inset-0 z-10">
                <Suspense fallback={<LoadingScreen />}>
                    <Experience />
                </Suspense>
            </div>

            {/* 科技感特效层 */}
            {webcamEnabled && <TechEffects />}

            {/* UI 层 */}
            <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-6 md:p-8">
                <header className="flex justify-between items-start">
                    <div>
                        {/* 标题容器 - 使用相对定位实现阴影层 */}
                        <div className="relative">
                            {/* 阴影/发光层 - 位于文字下方 */}
                            <h1 
                                className="text-3xl md:text-5xl lg:text-6xl font-bold cinzel absolute inset-0 select-none"
                                style={{
                                    color: 'transparent',
                                    textShadow: '0 0 30px rgba(255,215,0,0.4), 0 0 60px rgba(134,239,172,0.3)',
                                }}
                                aria-hidden="true"
                            >
                                🎄 CHRISTMAS MEMORIES ❄️
                            </h1>
                            {/* 主文字层 - 渐变色 */}
                            <h1 
                                className="text-3xl md:text-5xl lg:text-6xl font-bold cinzel relative"
                                style={{
                                    background: 'linear-gradient(135deg, #fca5a5 0%, #86efac 50%, #fde68a 100%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text',
                                }}
                            >
                                🎄 CHRISTMAS MEMORIES ❄️
                            </h1>
                        </div>
                        <p 
                            className="cinzel tracking-[0.2em] text-xs md:text-sm mt-2 md:mt-3"
                            style={{
                                color: state === 'CHAOS' ? 'rgba(251,191,36,0.7)' : 'rgba(134,239,172,0.7)',
                                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                            }}
                        >
                            {state === 'CHAOS' 
                                ? '✨ SCATTERED MEMORIES • EXPLORE YOUR JOURNEY ✨' 
                                : '🎁 MEMORY TREE • TIMELINE OF LOVE 🎁'}
                        </p>
                    </div>
                </header>
                
                {/* 状态指示器 */}
                <motion.div 
                    className="self-end"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    <div className="flex items-center gap-2 text-xs text-white/40 cinzel">
                        <div className={`w-2 h-2 rounded-full ${state === 'FORMED' ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
                        <span>{state === 'FORMED' ? 'TREE MODE' : 'CHAOS MODE'}</span>
                    </div>
                </motion.div>
            </div>

            {/* 光标层 */}
            <AnimatePresence>
                {pointer && <DreamyCursor pointer={pointer} progress={hoverProgress} />}
            </AnimatePresence>

            {/* 弹窗层 */}
            <AnimatePresence>
                {selectedPhotoUrl && <PhotoModal url={selectedPhotoUrl} onClose={() => setSelectedPhotoUrl(null)} />}
            </AnimatePresence>
        </main>
    );
};

const App: React.FC = () => {
    const [state, setState] = useState<AppState>('CHAOS');
    const [rotationSpeed, setRotationSpeed] = useState<number>(0.3); // 固定基础旋转速度
    const [rotationBoost, setRotationBoost] = useState<number>(0); // 额外加速度
    const [webcamEnabled, setWebcamEnabled] = useState<boolean>(true);
    const [pointer, setPointer] = useState<PointerCoords | null>(null);
    const [hoverProgress, setHoverProgress] = useState<number>(0);
    const [clickTrigger, setClickTrigger] = useState<number>(0);
    const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
    const [panOffset, setPanOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
    const [zoomOffset, setZoomOffset] = useState<number>(0);

    return (
        <TreeContext.Provider value={{
            state, setState,
            rotationSpeed, setRotationSpeed,
            webcamEnabled, setWebcamEnabled,
            pointer, setPointer,
            hoverProgress, setHoverProgress,
            clickTrigger, setClickTrigger,
            selectedPhotoUrl, setSelectedPhotoUrl,
            panOffset, setPanOffset,
            rotationBoost, setRotationBoost,
            zoomOffset, setZoomOffset
        }}>
            <AppContent />
        </TreeContext.Provider>
    );
};

export default App;