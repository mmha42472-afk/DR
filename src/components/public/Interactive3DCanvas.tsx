import React, { useEffect, useRef } from 'react';

interface Interactive3DCanvasProps {
  primaryColor?: string;
  accentColor?: string;
  className?: string;
  particleCount?: number;
}

/**
 * Lightweight, high-fps Canvas 3D Medical Wave & Floating Stethoscope DNA Node visualization.
 * No heavy 3D dependencies required, zero lag, smooth 60fps on mobile & desktop.
 */
export const Interactive3DCanvas: React.FC<Interactive3DCanvasProps> = ({
  primaryColor = '#0F2A4A',
  accentColor = '#0D9488',
  className = '',
  particleCount = 42,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth || 300);
    let height = (canvas.height = canvas.offsetHeight || 300);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth || 300;
      height = canvas.height = canvas.offsetHeight || 300;
    };

    window.addEventListener('resize', handleResize);

    // 3D Nodes in spherical/helix coordinate space
    const nodes: Array<{
      x: number;
      y: number;
      z: number;
      radius: number;
      baseColor: string;
      speed: number;
      pulse: number;
    }> = [];

    for (let i = 0; i < particleCount; i++) {
      const theta = (i / particleCount) * Math.PI * 2 * 3;
      const phi = (i / particleCount) * Math.PI - Math.PI / 2;
      const sphereRadius = 90 + (i % 3) * 15;

      nodes.push({
        x: Math.cos(theta) * Math.cos(phi) * sphereRadius,
        y: Math.sin(phi) * sphereRadius,
        z: Math.sin(theta) * Math.cos(phi) * sphereRadius,
        radius: 2.2 + (i % 3) * 1.2,
        baseColor: i % 2 === 0 ? accentColor : primaryColor,
        speed: 0.006 + (i % 5) * 0.001,
        pulse: Math.random() * Math.PI,
      });
    }

    let angleX = 0;
    let angleY = 0;
    let targetAngleX = 0;
    let targetAngleY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - width / 2;
      const mouseY = e.clientY - rect.top - height / 2;
      targetAngleY = (mouseX / width) * 0.6;
      targetAngleX = -(mouseY / height) * 0.6;
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    const fov = 260;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Smooth camera interpolation
      angleX += (targetAngleX - angleX) * 0.05;
      angleY += (targetAngleY - angleY) * 0.05;

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      const projectedPoints: Array<{ x: number; y: number; z: number; radius: number; color: string }> = [];

      nodes.forEach((node) => {
        // Continuous gentle self-rotation
        const tempX = node.x * Math.cos(node.speed) - node.z * Math.sin(node.speed);
        const tempZ = node.x * Math.sin(node.speed) + node.z * Math.cos(node.speed);
        node.x = tempX;
        node.z = tempZ;

        // Apply interactive camera rotation
        // 1. Rotate around Y
        let x1 = node.x * cosY - node.z * sinY;
        let z1 = node.x * sinY + node.z * cosY;

        // 2. Rotate around X
        let y1 = node.y * cosX - z1 * sinX;
        let z2 = node.y * sinX + z1 * cosX;

        // Perspective 3D projection
        const scale = fov / (fov + z2 + 180);
        const screenX = width / 2 + x1 * scale;
        const screenY = height / 2 + y1 * scale;

        projectedPoints.push({
          x: screenX,
          y: screenY,
          z: z2,
          radius: Math.max(1, node.radius * scale),
          color: node.baseColor,
        });
      });

      // Sort by depth (painters algorithm)
      projectedPoints.sort((a, b) => b.z - a.z);

      // Draw connective pulse lines between proximate nodes
      for (let i = 0; i < projectedPoints.length; i++) {
        for (let j = i + 1; j < projectedPoints.length; j++) {
          const p1 = projectedPoints[i];
          const p2 = projectedPoints[j];
          const distSq = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
          if (distSq < 2200) {
            const alpha = (1 - distSq / 2200) * 0.25;
            ctx.strokeStyle = `rgba(13, 148, 136, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      // Draw projected particle spheres with subtle ambient glow
      projectedPoints.forEach((p) => {
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2.5);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(0.5, p.color + 'aa');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x - p.radius * 0.3, p.y - p.radius * 0.3, p.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [primaryColor, accentColor, particleCount]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full pointer-events-auto cursor-grab active:cursor-grabbing ${className}`}
      style={{ touchAction: 'none' }}
    />
  );
};
