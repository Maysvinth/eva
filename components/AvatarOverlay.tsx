import React, { useState, useEffect, useRef } from 'react';
import { CharacterProfile, VoiceName, ConnectionState } from '../types';
import { VOICE_LIBRARY, CHARACTERS } from '../constants';
import { Mic, MicOff, Maximize, Minimize, Image as ImageIcon, Palette, ExternalLink, Settings, X, Upload, User } from 'lucide-react';

interface AvatarOverlayProps {
  activeCharacter: CharacterProfile;
  setActiveCharacter: (char: CharacterProfile) => void;
  connectionState: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  volumeRef: React.MutableRefObject<number>;
  isAvatarMode: boolean;
  setIsAvatarMode: (mode: boolean) => void;
}

const AvatarOverlay: React.FC<AvatarOverlayProps> = ({
  activeCharacter,
  setActiveCharacter,
  connectionState,
  onConnect,
  onDisconnect,
  volumeRef,
  isAvatarMode,
  setIsAvatarMode
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [bgType, setBgType] = useState<'solid' | 'gradient' | 'image'>('gradient');
  const [bgValue, setBgValue] = useState<string>(`from-${activeCharacter.themeColor}-900 to-black`);
  const [customBgImage, setCustomBgImage] = useState<string | null>(null);
  const [customAvatarImage, setCustomAvatarImage] = useState<string | null>(null);
  const [mouthOpenness, setMouthOpenness] = useState(0);

  // Lip-sync animation loop
  useEffect(() => {
    let animationFrameId: number;

    const animate = () => {
      const vol = volumeRef.current;
      // Smooth dampening for mouth movement
      setMouthOpenness(prev => prev + (vol - prev) * 0.3);
      animationFrameId = requestAnimationFrame(animate);
    };

    if (connectionState === 'connected') {
      animate();
    } else {
      setMouthOpenness(0);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [connectionState, volumeRef]);

  // Handle Popout (Embedding Fallback)
  const handlePopout = () => {
    window.open(window.location.href, 'RazorEVA', 'width=400,height=800,menubar=no,toolbar=no,location=no,status=no');
  };

  // Handle Image Uploads
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'bg' | 'avatar') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'bg') setCustomBgImage(reader.result as string);
        else setCustomAvatarImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const currentThemeColor = activeCharacter.themeColor;

  // Dynamic Styles based on mode
  const containerClass = isAvatarMode 
    ? "fixed inset-0 z-[200] flex flex-col items-center justify-center transition-all duration-500" 
    : "fixed bottom-4 right-4 z-[200] w-24 h-24 flex items-center justify-center transition-all duration-500";

  const backgroundStyle = isAvatarMode
    ? customBgImage && bgType === 'image'
      ? { backgroundImage: `url(${customBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : bgType === 'solid' ? { backgroundColor: bgValue } : {} // Gradient handled via class
    : {};

  const gradientClass = isAvatarMode && bgType === 'gradient' 
    ? `bg-gradient-to-br ${bgValue}` 
    : '';

  if (!isAvatarMode) {
    // Mini Floating Action Button View
    return (
      <button 
        onClick={() => setIsAvatarMode(true)}
        className={`fixed bottom-6 right-6 z-[100] w-14 h-14 rounded-full bg-${currentThemeColor}-900/80 border-2 border-${currentThemeColor}-500 shadow-[0_0_15px_currentColor] flex items-center justify-center hover:scale-110 transition-transform`}
      >
        <User className={`w-6 h-6 text-${currentThemeColor}-400`} />
        {connectionState === 'connected' && (
             <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full animate-pulse border border-black" />
        )}
      </button>
    );
  }

  return (
    <div className={`${containerClass} ${gradientClass}`} style={backgroundStyle}>
      
      {/* --- HUD CONTROLS --- */}
      <div className="absolute top-4 right-4 flex gap-2 z-50">
        <button onClick={handlePopout} className="p-2 bg-black/40 rounded-full text-gray-400 hover:text-white backdrop-blur-md">
            <ExternalLink className="w-5 h-5" />
        </button>
        <button onClick={() => setShowSettings(!showSettings)} className="p-2 bg-black/40 rounded-full text-gray-400 hover:text-white backdrop-blur-md">
            <Settings className="w-5 h-5" />
        </button>
        <button onClick={() => setIsAvatarMode(false)} className="p-2 bg-black/40 rounded-full text-gray-400 hover:text-white backdrop-blur-md">
            <Minimize className="w-5 h-5" />
        </button>
      </div>

      {/* --- AVATAR RENDERING --- */}
      <div className="relative flex flex-col items-center justify-center w-full h-full max-w-md mx-auto">
         
         {customAvatarImage ? (
             <div 
                className="relative transition-transform duration-100"
                style={{ 
                    transform: `scale(${1 + mouthOpenness * 0.1})`, // Bounce effect on loud volume
                    height: '70%',
                    width: '100%',
                    backgroundImage: `url(${customAvatarImage})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center bottom',
                    filter: `drop-shadow(0 0 ${10 + mouthOpenness * 50}px ${activeCharacter.visualizerColor})`
                }}
             />
         ) : (
             // Default Cyberpunk Silhouette
             <div className="relative w-64 h-80 flex items-center justify-center">
                 {/* Body Shape */}
                 <div className={`w-48 h-64 bg-gray-900 rounded-t-full border-x-2 border-t-2 border-${currentThemeColor}-500/50 shadow-[0_0_30px_inset] shadow-${currentThemeColor}-900/50 relative overflow-hidden`}>
                     {/* Scanlines */}
                     <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px] opacity-20" />
                     
                     {/* Eyes */}
                     <div className="absolute top-20 left-10 w-8 h-2 bg-gray-800 rounded-full opacity-50" />
                     <div className="absolute top-20 right-10 w-8 h-2 bg-gray-800 rounded-full opacity-50" />

                     {/* MOUTH / CORE (Lip Sync) */}
                     <div 
                        className="absolute top-32 left-1/2 transform -translate-x-1/2 bg-white rounded-full transition-all duration-75 shadow-[0_0_20px_white]"
                        style={{
                            width: '40px',
                            height: `${4 + mouthOpenness * 40}px`,
                            backgroundColor: activeCharacter.visualizerColor,
                            boxShadow: `0 0 ${20 + mouthOpenness * 20}px ${activeCharacter.visualizerColor}`
                        }}
                     />
                 </div>
                 {/* Head Glow */}
                 <div className={`absolute -top-4 w-32 h-4 bg-${currentThemeColor}-500/20 rounded-full blur-xl animate-pulse`} />
             </div>
         )}
      </div>

      {/* --- BOTTOM CONTROLS --- */}
      <div className="absolute bottom-10 left-0 w-full flex flex-col items-center gap-6 z-50">
          
          <div className="text-center">
              <h2 className={`text-2xl font-display font-bold text-${currentThemeColor}-500 tracking-wider shadow-black drop-shadow-md`}>
                  {activeCharacter.name}
              </h2>
              <p className="text-xs text-white/70 font-mono mt-1 bg-black/30 px-2 py-0.5 rounded">
                  {connectionState.toUpperCase()}
              </p>
          </div>

          <button
            onClick={connectionState === 'connected' ? onDisconnect : onConnect}
            className={`w-20 h-20 rounded-full flex items-center justify-center border-4 transition-all duration-300 shadow-2xl ${
                connectionState === 'connected' 
                ? `bg-red-500/20 border-red-500 hover:bg-red-500/40 text-red-500 animate-pulse` 
                : `bg-${currentThemeColor}-600 border-${currentThemeColor}-400 text-white hover:scale-105`
            }`}
          >
              {connectionState === 'connected' ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </button>
      </div>

      {/* --- SETTINGS PANEL --- */}
      {showSettings && (
          <div className="absolute bottom-0 left-0 w-full bg-black/90 backdrop-blur-md border-t border-gray-700 p-6 rounded-t-2xl z-[60] animate-fade-in-up max-h-[60vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-white font-bold flex items-center gap-2"><Settings className="w-4 h-4" /> AVATAR SETTINGS</h3>
                  <button onClick={() => setShowSettings(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>

              {/* Character Select */}
              <div className="mb-6">
                  <label className="text-xs text-gray-500 mb-2 block uppercase">Active Character</label>
                  <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                      {[...CHARACTERS].map(char => (
                          <button
                            key={char.id}
                            onClick={() => setActiveCharacter(char)}
                            className={`flex-shrink-0 px-4 py-2 rounded-lg border text-xs font-bold whitespace-nowrap transition-colors ${
                                activeCharacter.id === char.id 
                                ? `bg-${char.themeColor}-900/50 border-${char.themeColor}-500 text-${char.themeColor}-400`
                                : 'bg-gray-800 border-gray-700 text-gray-400'
                            }`}
                          >
                              {char.name}
                          </button>
                      ))}
                  </div>
              </div>

              {/* Background Settings */}
              <div className="mb-6">
                  <label className="text-xs text-gray-500 mb-2 block uppercase">Background</label>
                  <div className="flex gap-2 mb-2">
                      <button onClick={() => setBgType('solid')} className={`p-2 rounded ${bgType==='solid' ? 'bg-white text-black' : 'bg-gray-800'}`}><Palette className="w-4 h-4"/></button>
                      <button onClick={() => setBgType('gradient')} className={`p-2 rounded ${bgType==='gradient' ? 'bg-white text-black' : 'bg-gray-800'}`}><Maximize className="w-4 h-4"/></button>
                      <button onClick={() => setBgType('image')} className={`p-2 rounded ${bgType==='image' ? 'bg-white text-black' : 'bg-gray-800'}`}><ImageIcon className="w-4 h-4"/></button>
                  </div>
                  
                  {bgType === 'image' && (
                      <div className="flex items-center gap-2 mt-2">
                          <label className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700 text-xs">
                              <Upload className="w-3 h-3" /> Upload BG
                              <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'bg')} />
                          </label>
                          {customBgImage && <span className="text-xs text-green-400">Loaded</span>}
                      </div>
                  )}
                  {bgType === 'solid' && (
                       <input type="color" className="w-full h-8 rounded" onChange={(e) => setBgValue(e.target.value)} />
                  )}
              </div>

              {/* Avatar Upload */}
              <div className="mb-2">
                  <label className="text-xs text-gray-500 mb-2 block uppercase">Custom Avatar Image</label>
                   <label className="flex items-center justify-center w-full py-3 bg-gray-800 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700">
                      <Upload className="w-4 h-4 mr-2" />
                      <span className="text-xs text-gray-300">Upload PNG/JPG</span>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'avatar')} />
                  </label>
                  {customAvatarImage && <button onClick={() => setCustomAvatarImage(null)} className="text-xs text-red-400 mt-2 hover:underline">Remove Custom Avatar</button>}
              </div>

          </div>
      )}
    </div>
  );
};

export default AvatarOverlay;