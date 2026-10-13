import React, { useState } from 'react';
import { Model3DType, Profile3DViewerConfig } from '../../types/doctor';
import {
  Heart,
  Stethoscope,
  Activity,
  Layers,
  Box,
  RotateCw,
  Sparkles,
  Eye,
} from 'lucide-react';

interface Doctor3DModelViewerProps {
  config?: Profile3DViewerConfig;
  primaryColor?: string;
  accentColor?: string;
  doctorName?: string;
  specialty?: string;
  className?: string;
}

/**
 * Interactive 3D Medical Model / Hologram Viewer for Doctor Profile.
 * Uses pure CSS 3D transforms (preserve-3d, perspective, rotateX, rotateY, translateZ)
 * combined with interactive mouse-drag / hover rotation and dynamic ambient lighting.
 */
export const Doctor3DModelViewer: React.FC<Doctor3DModelViewerProps> = ({
  config,
  primaryColor = '#0F2A4A',
  accentColor = '#0D9488',
  doctorName = 'الطبيب',
  specialty = 'استشاري',
  className = '',
}) => {
  const isEnabled = config?.enabled !== false;
  const modelType: Model3DType = config?.modelType || 'dna';
  const autoRotate = config?.autoRotate !== false;
  const speed = config?.animationSpeed || 'normal';
  const wireframe = config?.wireframeMode || false;
  const scale = config?.scale || 1;

  // Manual drag rotation angles
  const [manualRotation, setManualRotation] = useState({ x: 15, y: 35 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  if (!isEnabled) return null;

  const animationClass = autoRotate
    ? modelType === 'heart'
      ? 'animate-heartbeat-3d'
      : speed === 'fast'
      ? 'animate-spin-3d-fast'
      : speed === 'slow'
      ? 'animate-spin-3d-slow'
      : 'animate-spin-3d'
    : '';

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setManualRotation((prev) => ({
      x: Math.max(-60, Math.min(60, prev.x - dy * 0.5)),
      y: (prev.y + dx * 0.5) % 360,
    }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      className={`relative rounded-3xl overflow-hidden p-6 border border-slate-200/90 bg-gradient-to-b from-white/95 to-slate-50/90 shadow-xl backdrop-blur-md ${className}`}
      dir="rtl"
    >
      {/* Viewer Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs"
            style={{ backgroundColor: accentColor }}
          >
            <Box className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
              <span>المجسم الطبي التفاعلي (3D Hologram)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-50 text-teal-800">
                LIVE 3D
              </span>
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">
              اسحب بالماوس للتدوير الحر أو التكبير
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
          <RotateCw className="w-3 h-3 text-teal-600 animate-spin" />
          <span>{autoRotate ? 'دوران تلقائي' : 'تحكم يدوي'}</span>
        </div>
      </div>

      {/* 3D Scene Viewport */}
      <div
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="relative w-full h-56 sm:h-64 flex items-center justify-center cursor-grab active:cursor-grabbing select-none overflow-hidden my-2"
        style={{
          perspective: '1200px',
        }}
      >
        {/* Dynamic ambient radial lighting */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40 blur-2xl rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${accentColor} 0%, transparent 65%)`,
          }}
        />

        {/* Gyroscope Orbit Ring */}
        <div
          className="absolute w-44 h-44 rounded-full border border-dashed border-teal-500/30 pointer-events-none animate-spin-3d-slow"
          style={{ transform: 'rotateX(70deg)' }}
        />

        {/* 3D Model Parent Container */}
        <div
          className={`relative transform-gpu ${autoRotate ? animationClass : ''}`}
          style={{
            transformStyle: 'preserve-3d',
            transform: autoRotate
              ? undefined
              : `rotateX(${manualRotation.x}deg) rotateY(${manualRotation.y}deg) scale(${scale})`,
          }}
        >
          {/* MODEL 1: DNA DOUBLE HELIX */}
          {modelType === 'dna' && (
            <div className="relative w-32 h-44 flex items-center justify-center transform-gpu">
              {[...Array(8)].map((_, i) => {
                const angle = i * 45;
                const topOffset = (i / 8) * 140 - 70;
                return (
                  <div
                    key={i}
                    className="absolute flex items-center justify-between w-28 h-2 rounded-full transform-gpu"
                    style={{
                      transform: `translateY(${topOffset}px) rotateY(${angle}deg)`,
                      background: wireframe
                        ? 'transparent'
                        : `linear-gradient(90deg, ${primaryColor} 0%, ${accentColor} 100%)`,
                      border: wireframe ? `1px dashed ${accentColor}` : 'none',
                    }}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full shadow-md animate-pulse"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <div
                      className="w-3.5 h-3.5 rounded-full shadow-md animate-pulse"
                      style={{ backgroundColor: accentColor }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* MODEL 2: 3D ANATOMICAL HEART WITH PULSE */}
          {modelType === 'heart' && (
            <div className="relative w-28 h-28 flex items-center justify-center transform-gpu">
              <div
                className="w-24 h-24 rounded-3xl flex items-center justify-center text-white shadow-2xl relative"
                style={{
                  backgroundColor: '#E11D48',
                  transform: 'rotate(45deg)',
                }}
              >
                <div className="absolute -top-7 left-0 w-24 h-16 rounded-t-full bg-rose-600" />
                <div className="absolute top-0 -left-7 w-16 h-24 rounded-l-full bg-rose-600" />
                <Heart className="w-12 h-12 text-white relative z-10 -rotate-45" />
              </div>
            </div>
          )}

          {/* MODEL 3: MEDICAL STETHOSCOPE 3D EMBLEM */}
          {modelType === 'stethoscope' && (
            <div className="relative w-36 h-36 flex items-center justify-center transform-gpu">
              <div
                className="w-28 h-28 rounded-2xl flex flex-col items-center justify-center text-white shadow-2xl p-4 border-2 border-white/40"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
                  transform: 'rotateX(20deg) rotateY(15deg)',
                }}
              >
                <Stethoscope className="w-12 h-12 text-white mb-2" />
                <span className="font-bold text-[10px] text-white/90">CLINICAL PRECISION</span>
              </div>
            </div>
          )}

          {/* MODEL 4: CADUCEUS / HEALTH ACTIVITY RING */}
          {modelType === 'caduceus' && (
            <div className="relative w-36 h-36 flex items-center justify-center transform-gpu">
              <div
                className="w-28 h-28 rounded-full border-4 flex items-center justify-center shadow-2xl"
                style={{
                  borderColor: accentColor,
                  background: `radial-gradient(circle, ${accentColor}20 0%, transparent 70%)`,
                }}
              >
                <div
                  className="w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center"
                  style={{ borderColor: primaryColor }}
                >
                  <Activity className="w-10 h-10" style={{ color: accentColor }} />
                </div>
              </div>
            </div>
          )}

          {/* MODEL 5: MEDICAL CUBE HOLOGRAPHIC CHIP */}
          {modelType === 'cube' && (
            <div
              className="relative w-24 h-24 transform-gpu"
              style={{
                transformStyle: 'preserve-3d',
                transform: 'rotateX(-25deg) rotateY(45deg)',
              }}
            >
              {/* 6 faces of the 3D cube */}
              <div
                className="absolute inset-0 rounded-xl flex items-center justify-center border-2 text-white font-bold text-xs"
                style={{
                  backgroundColor: `${primaryColor}cc`,
                  borderColor: accentColor,
                  transform: 'translateZ(48px)',
                }}
              >
                <Stethoscope className="w-6 h-6 text-teal-300" />
              </div>
              <div
                className="absolute inset-0 rounded-xl flex items-center justify-center border-2 text-white font-bold text-xs"
                style={{
                  backgroundColor: `${accentColor}cc`,
                  borderColor: primaryColor,
                  transform: 'rotateY(180deg) translateZ(48px)',
                }}
              >
                <Heart className="w-6 h-6 text-white" />
              </div>
              <div
                className="absolute inset-0 rounded-xl flex items-center justify-center border-2 text-white font-bold text-xs"
                style={{
                  backgroundColor: `${primaryColor}dd`,
                  borderColor: accentColor,
                  transform: 'rotateY(-90deg) translateZ(48px)',
                }}
              >
                <Activity className="w-6 h-6 text-emerald-300" />
              </div>
              <div
                className="absolute inset-0 rounded-xl flex items-center justify-center border-2 text-white font-bold text-xs"
                style={{
                  backgroundColor: `${accentColor}dd`,
                  borderColor: primaryColor,
                  transform: 'rotateY(90deg) translateZ(48px)',
                }}
              >
                <Sparkles className="w-6 h-6 text-amber-300" />
              </div>
              <div
                className="absolute inset-0 rounded-xl flex items-center justify-center border-2 text-white font-bold text-xs"
                style={{
                  backgroundColor: `${primaryColor}ee`,
                  borderColor: accentColor,
                  transform: 'rotateX(90deg) translateZ(48px)',
                }}
              >
                <Box className="w-6 h-6 text-cyan-200" />
              </div>
              <div
                className="absolute inset-0 rounded-xl flex items-center justify-center border-2 text-white font-bold text-xs"
                style={{
                  backgroundColor: `${accentColor}ee`,
                  borderColor: primaryColor,
                  transform: 'rotateX(-90deg) translateZ(48px)',
                }}
              >
                <Eye className="w-6 h-6 text-white" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Viewer Footer Tag */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-semibold text-slate-700 truncate">{doctorName}</span>
        <span className="font-mono text-teal-700">{specialty}</span>
      </div>
    </div>
  );
};
