import React, { useRef, useEffect } from 'react';

interface AvatarVisualizerProps {
  volumeRef: React.MutableRefObject<number>;
  color: string;
  isActive: boolean;
}

const AvatarVisualizer: React.FC<AvatarVisualizerProps> = ({ volumeRef, color, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const ringsRef = useRef<any[]>([]);
  
  // Convert Tailwind color name to hex roughly for canvas
  const getColorHex = (c: string) => {
    return c;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize rings
    if (ringsRef.current.length === 0) {
        for(let i=0; i<3; i++) {
            ringsRef.current.push({
                radius: 50 + i * 20,
                angle: i,
                speed: 0.02 + i * 0.01
            });
        }
    }

    const render = () => {
      // Optimization: Check if canvas size actually changed before setting width/height
      // Setting width/height clears the canvas context automatically
      if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
          canvas.width = canvas.offsetWidth;
          canvas.height = canvas.offsetHeight;
      }
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!isActive) {
        // Idling state
        ctx.beginPath();
        ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Even when idling, keep loop running to catch state changes smoothly
        requestRef.current = requestAnimationFrame(render);
        return;
      }

      // Read volume directly from ref (no React render needed)
      const volume = volumeRef.current;
      const hex = getColorHex(color);
      const baseRadius = 50 + (volume * 100);

      // Core
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = hex;
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Outer Glow
      const gradient = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.2, centerX, centerY, baseRadius * 1.5);
      gradient.addColorStop(0, hex);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Rotating Rings
      ringsRef.current.forEach((ring, i) => {
        ring.angle += ring.speed + (volume * 0.1);
        const r = ring.radius + (volume * 50 * (i+1));
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, ring.angle, ring.angle + Math.PI * 1.5);
        ctx.strokeStyle = hex;
        ctx.lineWidth = 2 + (volume * 5);
        ctx.lineCap = 'round';
        ctx.stroke();

        // Decorative ticks
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(-ring.angle);
        for(let j=0; j<4; j++) {
            ctx.rotate(Math.PI/2);
            ctx.fillStyle = hex;
            ctx.fillRect(r - 2, -2, 4, 4);
        }
        ctx.restore();
      });

      requestRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
    };
  }, [color, isActive, volumeRef]); 

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full"
    />
  );
};

export default AvatarVisualizer;