import React from 'react';

interface AvatarVisualizerProps {
  volumeRef: React.MutableRefObject<number>;
  color: string;
  isActive: boolean;
  ecoMode?: boolean;
}

// Optimized Visualizer
const AvatarVisualizer: React.FC<AvatarVisualizerProps> = ({ color, isActive, ecoMode = false }) => {
  
  if (ecoMode) {
      // --- ECO MODE (Zero CPU / CSS Only) ---
      // This mode uses CSS opacity transitions instead of JavaScript animation loops.
      // Essential for preventing thermal throttling on old Android devices.
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div 
            className="rounded-full transition-all duration-300 ease-in-out"
            style={{
              width: isActive ? '120px' : '60px',
              height: isActive ? '120px' : '60px',
              backgroundColor: color,
              // Since we can't read volume ref in CSS-only mode without re-rendering, 
              // we pulse between low/high opacity when active.
              opacity: isActive ? 0.8 : 0.2,
              boxShadow: isActive ? `0 0 40px ${color}` : 'none',
              border: `2px solid ${color}`,
              animation: isActive ? 'pulse-slow 2s infinite' : 'none'
            }}
          />
          <div 
            className="absolute rounded-full border border-gray-800"
            style={{
                width: '180px',
                height: '180px',
                borderColor: isActive ? color : '#333',
                opacity: 0.3
            }}
          />
          <style>{`
            @keyframes pulse-slow {
                0% { opacity: 0.5; transform: scale(0.95); }
                50% { opacity: 0.9; transform: scale(1.05); }
                100% { opacity: 0.5; transform: scale(0.95); }
            }
          `}</style>
        </div>
      );
  }

  // Note: For this specific request, we are using the Static/CSS visualizer as the primary implementation
  // because the user is on a legacy device. We are discarding the Canvas loop entirely for stability.
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div 
        className="rounded-full transition-all duration-100 ease-linear"
        style={{
          width: isActive ? '120px' : '60px',
          height: isActive ? '120px' : '60px',
          backgroundColor: color,
          opacity: isActive ? 0.9 : 0.2,
          boxShadow: isActive ? `0 0 50px ${color}` : 'none',
          border: `2px solid ${color}`
        }}
      />
      <div 
        className="absolute rounded-full border"
        style={{
            width: '200px',
            height: '200px',
            borderColor: color,
            opacity: isActive ? 0.2 : 0.05,
            transition: 'all 0.5s'
        }}
      />
    </div>
  );
};

export default AvatarVisualizer;