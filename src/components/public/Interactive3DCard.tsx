import React, { useRef, useState } from 'react';

interface Interactive3DCardProps {
  children: React.ReactNode;
  className?: string;
  depth?: number; // Maximum tilt angle in degrees (default: 12)
  glare?: boolean; // Show light reflection sheen
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * High-end 3D Perspective Card with realistic mouse-following gyroscopic tilt,
 * holographic glare reflection, and smooth spring-like recovery.
 */
export const Interactive3DCard: React.FC<Interactive3DCardProps> = ({
  children,
  className = '',
  depth = 10,
  glare = true,
  onClick,
  style = {},
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50, opacity: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate rotation: mouse on top tilts card back (-X), mouse on right tilts card right (+Y)
    const rotateY = ((mouseX - width / 2) / (width / 2)) * depth;
    const rotateX = -((mouseY - height / 2) / (height / 2)) * depth;

    setRotation({ x: rotateX, y: rotateY });

    if (glare) {
      const glareX = (mouseX / width) * 100;
      const glareY = (mouseY / height) * 100;
      setGlarePos({ x: glareX, y: glareY, opacity: 0.18 });
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotation({ x: 0, y: 0 });
    setGlarePos((prev) => ({ ...prev, opacity: 0 }));
  };

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative transform-gpu transition-transform ease-out ${className}`}
      style={{
        perspective: '1000px',
        transformStyle: 'preserve-3d',
        transform: `perspective(1000px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) scale3d(${
          isHovered ? 1.02 : 1
        }, ${isHovered ? 1.02 : 1}, 1)`,
        transitionDuration: isHovered ? '90ms' : '500ms',
        ...style,
      }}
    >
      {/* Card Content with 3D Pop Out effect */}
      <div className="relative w-full h-full transform-gpu" style={{ transform: 'translateZ(10px)' }}>
        {children}
      </div>

      {/* Holographic light sheen reflection */}
      {glare && (
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden transition-opacity duration-300 z-30"
          style={{
            opacity: glarePos.opacity,
            background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0) 65%)`,
          }}
        />
      )}
    </div>
  );
};
