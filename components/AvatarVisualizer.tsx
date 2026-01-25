import React from 'react';

interface AvatarVisualizerProps {
  volumeRef: React.MutableRefObject<number>;
  color: string;
  isActive: boolean;
  ecoMode?: boolean;
}

// STATIC VISUALIZER (Zero CPU Usage)
// Replaces the canvas animation loop with a simple CSS state change.
// This is critical for low-RAM/Old CPU devices to prevent thermal throttling.
const AvatarVisualizer: React.FC<AvatarVisualizerProps> = ({ color, isActive }) => {
  return (
    <div className="w-full h-full flex items-center justify-center">
      {/* Static Core - Changes opacity only, no JS loop */}
      <div 
        className="rounded-full transition-all duration-500 ease-in-out"
        style={{
          width: isActive ? '120px' : '60px',
          height: isActive ? '120px' : '60px',
          backgroundColor: color,
          opacity: isActive ? 0.8 : 0.2,
          boxShadow: isActive ? `0 0 40px ${color}` : 'none',
          border: `2px solid ${color}`
        }}
      />
      
      {/* Static Outer Ring */}
      <div 
        className="absolute rounded-full border border-gray-800"
        style={{
            width: '180px',
            height: '180px',
            borderColor: isActive ? color : '#333',
            opacity: 0.3
        }}
      />
    </div>
  );
};

export default AvatarVisualizer;