import React, { useState, useEffect, useRef } from 'react';
import { CharacterProfile, VoiceName, ConnectionState } from '../types';
import { VOICE_LIBRARY, CHARACTERS } from '../constants';
import { Mic, MicOff, Maximize, Minimize, Image as ImageIcon, Palette, ExternalLink, Settings, X, Upload, User, ChevronUp, ChevronDown, UserCircle2 } from 'lucide-react';

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
  
  // Per-Character Avatar Map
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  
  // Animation State
  const [mouthOpenness, setMouthOpenness] = useState(0);
  const [sway, setSway] = useState(0);
  const [breath, setBreath] = useState(0);
  const [gesture, setGesture] = useState(0);
  
  // Screen Scaling State (For Mobile/P10 Lite)
  const [scale, setScale] = useState(1);

  // Handle Resize for Scaling
  useEffect(() => {
    const handleResize = () => {
        const h = window.innerHeight;
        const w = window.innerWidth;
        // Calculate scale to fit avatar between top controls (~60px) and bottom controls (~120px)
        const availableHeight = h - 200; 
        const heightScale = Math.min(1.2, Math.max(0.6, availableHeight / 550)); // Adjusted base height
        const widthScale = Math.min(1, (w - 40) / 300);
        setScale(Math.min(heightScale, widthScale));
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Init
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Animation Loop
  useEffect(() => {
    let animationFrameId: number;
    let time = 0;

    const animate = () => {
      time += 0.05;
      const vol = volumeRef.current;
      
      // Lip Sync Smoothing
      setMouthOpenness(prev => prev + (vol - prev) * 0.4);

      // Idle Animations (Sine waves based on time)
      setSway(Math.sin(time * 0.5) * 1.5); // Gentle sway
      setBreath(Math.sin(time * 1.2) * 0.015); // Breathing
      
      // Speaking Gestures
      setGesture(prev => {
          const target = vol > 0.1 ? Math.min(vol * 20, 15) : 0;
          return prev + (target - prev) * 0.1;
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    if (connectionState === 'connected') {
      animate();
    } else {
      setMouthOpenness(0);
      setGesture(0);
      setSway(0);
      setBreath(0);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [connectionState, volumeRef]);

  // Handle Popout
  const handlePopout = () => {
    window.open(window.location.href, 'RazorEVA', 'width=400,height=800,menubar=no,toolbar=no,location=no,status=no');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'bg' | 'avatar') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'bg') {
            setCustomBgImage(reader.result as string);
        } else {
            // Save avatar specifically for the current character
            setAvatarMap(prev => ({
                ...prev,
                [activeCharacter.id]: reader.result as string
            }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const currentThemeColor = activeCharacter.themeColor;

  const containerClass = isAvatarMode 
    ? "fixed inset-0 z-[200] flex flex-col items-center justify-center transition-all duration-500" 
    : "hidden";

  const backgroundStyle = isAvatarMode
    ? customBgImage && bgType === 'image'
      ? { backgroundImage: `url(${customBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : bgType === 'solid' ? { backgroundColor: bgValue } : {}
    : {};

  const gradientClass = isAvatarMode && bgType === 'gradient' 
    ? `bg-gradient-to-br ${bgValue}` 
    : '';

  // Get the custom avatar for the current character
  const customAvatarImage = avatarMap[activeCharacter.id];

  // --- 2D ARTICULATED AVATAR RENDERER ---
  const renderAvatar = () => {
    // --- CUSTOM UPLOADED AVATAR (V-TUBER ANIMATION MODE) ---
    if (customAvatarImage) {
        return (
             <div className="relative w-full h-[500px] flex items-end justify-center">
                 {/* Glow/Aura Background - Pulses with voice */}
                 <div 
                    className="absolute bottom-10 w-full h-[60%] opacity-30 blur-2xl rounded-full transition-all duration-75"
                    style={{
                        backgroundColor: activeCharacter.visualizerColor,
                        transform: `scale(${1 + mouthOpenness * 0.3})`,
                    }}
                 />

                 {/* Animated Avatar Container */}
                 <div 
                    className="relative transition-transform ease-out origin-bottom will-change-transform flex items-end justify-center h-full w-full"
                    style={{ 
                        // Physics Simulation:
                        // 1. Breathing: Vertical scaling + slight Y translation
                        // 2. Swaying: Gentle rotation
                        // 3. Talking: "Squash & Stretch" bounce effect
                        transform: `
                            scaleY(${1 + breath * 0.02}) 
                            rotate(${sway * 0.5}deg) 
                            translateY(${breath * 5}px)
                            scale(${1 + mouthOpenness * 0.03})
                        `
                    }}
                 >
                     <img 
                        src={customAvatarImage}
                        alt="Custom Avatar"
                        className="h-full w-auto object-contain drop-shadow-2xl"
                        style={{
                            // Add a subtle brightness flash when talking to simulate "energy"
                            // And dynamic shadow matching voice color
                            filter: `brightness(${1 + mouthOpenness * 0.15}) drop-shadow(0 0 ${10 + mouthOpenness * 15}px ${activeCharacter.visualizerColor})`,
                            transform: `translateY(${-mouthOpenness * 10}px)` // Bounce up when talking
                        }}
                     />
                 </div>
             </div>
        );
    }

    // Common Transforms for Articulation
    const torsoTransform = { transform: `scaleY(${1 + breath}) translateY(${breath * 5}px)` };
    const headTransform = { transform: `translateY(${gesture * -1}px) rotate(${sway * 0.5 + (gesture * 0.2)}deg)` };
    const armLeftTransform = { transform: `rotate(${5 + gesture * 2}deg)` };
    const armRightTransform = { transform: `rotate(${-5 - gesture * 2}deg)` };
    const mouthHeight = Math.max(2, mouthOpenness * 15); // Adjusted scale
    
    // --- NIKO MIKADONO (High-Fidelity) ---
    if (activeCharacter.id === 'niko_mika') {
        return (
            <div className="relative w-64 h-[500px] flex flex-col items-center justify-end will-change-transform font-sans">
                 {/* Hair Back */}
                 <div className="absolute top-10 w-56 h-56 bg-[#f59e0b] rounded-full z-0 border-2 border-black"></div>

                 {/* HEAD */}
                 <div className="relative z-30 w-36 h-38 bg-[#fff0f5] rounded-full flex flex-col items-center pt-14 border-2 border-black shadow-lg" style={headTransform}>
                      {/* Headband / Hair Accessories */}
                      <div className="absolute top-0 w-48 h-12 bg-black rounded-t-full z-20 transform -translate-y-2 scale-90 border-2 border-gray-800"></div>
                      
                      {/* Hair Front (Spiky) */}
                      <div className="absolute top-[-20px] w-44 h-32 bg-[#fbbf24] rounded-t-full rounded-b-[3rem] z-30 border-2 border-black overflow-hidden">
                           {/* Spikes CSS */}
                           <div className="absolute bottom-0 left-4 w-6 h-12 bg-[#fbbf24] border-r-2 border-black/10 transform rotate-12"></div>
                           <div className="absolute bottom-0 right-4 w-6 h-12 bg-[#fbbf24] border-l-2 border-black/10 transform -rotate-12"></div>
                      </div>
                      <div className="absolute top-6 left-6 w-8 h-4 bg-yellow-200 opacity-40 rounded-full transform -rotate-12 z-40"></div>

                      {/* Eyes */}
                      <div className="flex gap-6 mb-2 z-30 mt-3">
                           <div className="w-8 h-8 bg-white rounded-full border-2 border-black flex items-center justify-center relative overflow-hidden">
                               <div className="w-4 h-6 bg-[#10b981] rounded-full"></div>
                               <div className="absolute top-1 right-2 w-2 h-2 bg-white rounded-full"></div>
                           </div>
                           <div className="w-8 h-8 bg-white rounded-full border-2 border-black flex items-center justify-center relative overflow-hidden">
                               <div className="w-4 h-6 bg-[#10b981] rounded-full"></div>
                               <div className="absolute top-1 right-2 w-2 h-2 bg-white rounded-full"></div>
                           </div>
                      </div>

                      {/* Mouth with Fang */}
                      <div className="relative">
                          <div className="w-12 bg-[#881337] rounded-b-3xl transition-all duration-75 z-30 border-t-2 border-black/20" style={{ height: `${mouthHeight}px`, minHeight: '4px' }}>
                          </div>
                          <div className="w-2 h-2 bg-white absolute top-0 right-2 rotate-45 transform translate-y-[-50%] z-40 border-r border-b border-black/20"></div> {/* Fang */}
                      </div>
                 </div>

                 {/* TORSO */}
                 <div className="relative z-20 -mt-2 w-40 h-44 bg-[#f97316] rounded-2xl flex flex-col items-center border-2 border-black shadow-md" style={torsoTransform}>
                      {/* White Stripe Center */}
                      <div className="absolute w-20 h-full bg-white border-x-2 border-black/10"></div>
                      {/* Logo */}
                      <div className="absolute top-4 text-orange-600 font-black text-xl z-20 tracking-tighter border-2 border-orange-600 px-1 rounded bg-white">MK</div>
                      {/* Zipper */}
                      <div className="absolute top-12 w-1 h-32 bg-gray-300 border-x border-gray-400 z-20"></div>

                      {/* Arms */}
                      <div className="absolute -left-7 top-4 w-12 h-36 bg-[#fff0f5] rounded-full border-2 border-black origin-top-right transition-transform" style={armLeftTransform}>
                           <div className="absolute top-0 w-full h-12 bg-[#f97316] border-b-2 border-black rounded-t-full"></div> {/* Sleeve */}
                           <div className="absolute bottom-0 w-12 h-12 bg-[#fff0f5] rounded-full border-2 border-black scale-90"></div> {/* Fist */}
                      </div>
                      <div className="absolute -right-7 top-4 w-12 h-36 bg-[#fff0f5] rounded-full border-2 border-black origin-top-left transition-transform" style={armRightTransform}>
                           <div className="absolute top-0 w-full h-12 bg-[#f97316] border-b-2 border-black rounded-t-full"></div> {/* Sleeve */}
                           <div className="absolute bottom-0 w-12 h-12 bg-[#fff0f5] rounded-full border-2 border-black scale-90"></div> {/* Fist */}
                      </div>
                 </div>

                 {/* LEGS */}
                 <div className="relative z-10 -mt-4 flex justify-center gap-3">
                     {/* Spats */}
                     <div className="absolute -top-2 w-40 h-16 bg-[#1f2937] rounded-b-3xl border-2 border-black z-20">
                         <div className="absolute bottom-2 left-2 w-8 h-1 bg-white"></div>
                         <div className="absolute bottom-2 right-2 w-8 h-1 bg-white"></div>
                     </div>
                     {/* Legs */}
                     <div className="w-14 h-48 bg-[#fff0f5] border-2 border-black border-t-0 flex flex-col justify-end items-center mt-2">
                         <div className="w-full h-12 bg-orange-600 border-t-2 border-black"></div> {/* Sock/Shoe Top */}
                         <div className="w-16 h-8 bg-white rounded-b-lg border-2 border-black mb-[-2px] border-t-0"></div> {/* Sneaker */}
                     </div>
                     <div className="w-14 h-48 bg-[#fff0f5] border-2 border-black border-t-0 flex flex-col justify-end items-center mt-2">
                         <div className="w-full h-12 bg-orange-600 border-t-2 border-black"></div>
                         <div className="w-16 h-8 bg-white rounded-b-lg border-2 border-black mb-[-2px] border-t-0"></div>
                     </div>
                 </div>
            </div>
        );
    }
    
    // --- GENERIC / FALLBACK / AI HOSHINO (Simplified for brevity but compatible) ---
    // (Keeping Ai Hoshino as 2D Cel-Shaded from previous iteration but ensuring full height consistency)
    if (activeCharacter.id === 'ai_hoshino') {
        return (
            <div className="relative w-64 h-[500px] flex flex-col items-center justify-end will-change-transform font-sans" style={torsoTransform}>
                 <div className="absolute top-6 w-64 h-80 rounded-full z-0 opacity-90 border-2 border-pink-900 bg-[#d946ef]"></div>
                 <div className="relative z-20 w-36 h-40 rounded-2xl flex flex-col items-center pt-14 border-2 border-pink-900 bg-[#fff0f5]" style={headTransform}>
                      <div className="absolute top-[-14px] w-44 h-32 bg-[#f0abfc] rounded-t-full rounded-br-[4rem] z-30 border-2 border-pink-900"></div>
                      <div className="absolute -left-4 top-4 w-10 h-10 bg-pink-300 rounded-full z-40 border-2 border-black"></div> 
                      <div className="flex gap-6 mb-4 z-30 mt-4 relative">
                           <div className="w-12 h-12 bg-purple-900 rounded-full flex items-center justify-center relative overflow-hidden border-2 border-black">
                               <div className="text-white text-xl font-bold">★</div>
                           </div>
                           <div className="w-12 h-12 bg-purple-900 rounded-full flex items-center justify-center relative overflow-hidden border-2 border-black">
                               <div className="text-white text-xl font-bold">★</div>
                           </div>
                      </div>
                      <div className="w-10 bg-[#be123c] rounded-b-full transition-all duration-75 z-30" style={{ height: `${mouthHeight}px`, minHeight: '3px' }}></div>
                 </div>
                 <div className="relative z-10 -mt-4 w-36 h-44 bg-[#fae8ff] rounded-xl flex flex-col items-center border-t-8 border-pink-500 border-2 border-pink-900">
                      <div className="w-full h-full flex flex-col items-center justify-center">
                          <div className="w-12 h-12 bg-pink-500 rounded-full mb-2 border-2 border-white"></div>
                          <div className="w-full h-1 bg-pink-300"></div>
                      </div>
                      <div className="absolute -left-6 top-4 w-10 h-36 bg-[#ffe4e6] rounded-full origin-top-right transition-transform border-2 border-pink-900" style={armLeftTransform}>
                           <div className="absolute bottom-0 w-full h-10 bg-white border-t-2 border-pink-200"></div>
                      </div>
                      <div className="absolute -right-6 top-4 w-10 h-36 bg-[#ffe4e6] rounded-full origin-top-left transition-transform border-2 border-pink-900" style={armRightTransform}>
                           <div className="absolute bottom-0 w-full h-10 bg-white border-t-2 border-pink-200"></div>
                      </div>
                 </div>
                 <div className="relative z-0 -mt-4 w-40 h-52 flex justify-center gap-2">
                     <div className="w-12 h-full bg-[#fce7f3] border-2 border-pink-300 flex flex-col justify-end">
                         <div className="w-full h-16 bg-pink-600 border-t-2 border-black"></div>
                     </div>
                     <div className="w-12 h-full bg-[#fce7f3] border-2 border-pink-300 flex flex-col justify-end">
                         <div className="w-full h-16 bg-pink-600 border-t-2 border-black"></div>
                     </div>
                 </div>
            </div>
        );
    }

    // Default Humanoid (Tech Style)
    return (
         <div className="relative w-64 h-[450px] flex flex-col items-center justify-end opacity-90 will-change-transform" style={torsoTransform}>
             <div className={`absolute top-0 w-48 h-48 rounded-full border-2 border-${currentThemeColor}-500 opacity-20 animate-spin-slow`} style={{ borderStyle: 'dashed' }}></div>
             <div className="relative z-20 w-32 h-40 bg-gray-900 rounded-2xl border border-gray-700 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)]" style={headTransform}>
                 <div className={`w-24 h-6 bg-${currentThemeColor}-500/50 rounded-full blur-sm mb-4 animate-pulse`}></div> 
                 <div className={`w-24 h-1 bg-${currentThemeColor}-400`}></div> 
                 <div 
                    className="mt-6 w-12 bg-white rounded-full shadow-[0_0_10px_white]"
                    style={{
                        height: `${4 + mouthOpenness * 40}px`,
                        backgroundColor: activeCharacter.visualizerColor,
                        boxShadow: `0 0 ${10 + mouthOpenness * 20}px ${activeCharacter.visualizerColor}`
                    }}
                 />
             </div>
             <div className={`relative z-10 -mt-4 w-40 h-48 bg-gray-800 rounded-xl border-x border-${currentThemeColor}-500/30 flex flex-col items-center`}>
                  <div className={`w-20 h-20 mt-4 rounded-full border-4 border-${currentThemeColor}-500/20`}></div>
                  <div className="absolute -left-8 top-2 w-10 h-40 bg-gray-900 rounded-lg border border-gray-700 origin-top-right transition-transform" style={armLeftTransform}></div>
                  <div className="absolute -right-8 top-2 w-10 h-40 bg-gray-900 rounded-lg border border-gray-700 origin-top-left transition-transform" style={armRightTransform}></div>
             </div>
             <div className="relative z-0 -mt-2 w-40 h-40 flex justify-center gap-4">
                 <div className="w-14 h-full bg-gray-900 rounded-b-lg border border-gray-800"></div>
                 <div className="w-14 h-full bg-gray-900 rounded-b-lg border border-gray-800"></div>
             </div>
         </div>
    );
  };

  if (!isAvatarMode) {
    // Mode Toggle Button (Bottom-Right)
    return (
      <button 
        onClick={() => setIsAvatarMode(true)}
        className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 pl-4 pr-5 py-3 rounded-full bg-${currentThemeColor}-900/90 border border-${currentThemeColor}-500/50 shadow-[0_0_20px_rgba(0,0,0,0.5)] hover:scale-105 hover:bg-${currentThemeColor}-900 transition-all backdrop-blur-md group`}
      >
        <div className={`p-1.5 rounded-full bg-${currentThemeColor}-500/20`}>
             <UserCircle2 className={`w-5 h-5 text-${currentThemeColor}-400`} />
        </div>
        <span className={`text-sm font-display font-bold text-${currentThemeColor}-100 tracking-wide`}>AVATAR MODE</span>
        {connectionState === 'connected' && (
             <span className="absolute top-0 right-0 -mt-1 -mr-1 w-3 h-3 bg-green-500 rounded-full animate-pulse border-2 border-black" />
        )}
      </button>
    );
  }

  return (
    <div className={`${containerClass} ${gradientClass}`} style={backgroundStyle}>
      
      {/* --- TOP CONTROLS --- */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-3">
        {/* Main Exit Button */}
        <button 
            onClick={() => setIsAvatarMode(false)} 
            className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white transition-colors shadow-lg backdrop-blur-md"
            aria-label="Exit Avatar Mode"
        >
            <X className="w-6 h-6" />
        </button>

        {/* Tools Group */}
        <div className="flex flex-col gap-2 bg-black/30 p-2 rounded-full backdrop-blur-md border border-white/5">
            <button onClick={handlePopout} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors" title="Popout Window">
                <ExternalLink className="w-5 h-5" />
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className={`p-2 hover:bg-white/10 rounded-full transition-colors ${showSettings ? 'text-cyan-400 bg-white/10' : 'text-gray-400 hover:text-white'}`} title="Settings">
                <Settings className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* --- AVATAR RENDERING --- */}
      <div className="relative flex flex-col items-center justify-center w-full h-full max-w-lg mx-auto p-6 overflow-hidden" onClick={() => setShowSettings(false)}>
         {/* Scaled Wrapper for Mobile/P10 Lite */}
         <div style={{ transform: `scale(${scale})` }} className="origin-center transition-transform duration-200 ease-out">
            {renderAvatar()}
         </div>
      </div>

      {/* --- BOTTOM CONTROLS (Mic) --- */}
      <div className={`absolute bottom-8 left-0 w-full flex flex-col items-center gap-6 z-40 transition-all duration-300 ${showSettings ? 'translate-y-[-240px] scale-90' : ''}`}>
          
          <div className="text-center">
              <h2 className={`text-3xl font-display font-bold text-${currentThemeColor}-500 tracking-wider shadow-black drop-shadow-md bg-black/50 px-4 py-1 rounded-lg backdrop-blur-sm`}>
                  {activeCharacter.name}
              </h2>
              <p className="text-xs text-white/70 font-mono mt-2 inline-block bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10">
                  {connectionState === 'connected' ? 'ONLINE' : 'OFFLINE'}
              </p>
          </div>

          <button
            onClick={(e) => {
                e.stopPropagation();
                connectionState === 'connected' ? onDisconnect() : onConnect();
            }}
            className={`w-24 h-24 rounded-full flex items-center justify-center border-4 transition-all duration-300 shadow-2xl ${
                connectionState === 'connected' 
                ? `bg-red-500/20 border-red-500 hover:bg-red-500/40 text-red-500 animate-pulse` 
                : `bg-${currentThemeColor}-600 border-${currentThemeColor}-400 text-white hover:scale-105 hover:shadow-[0_0_30px_${activeCharacter.visualizerColor}]`
            }`}
          >
              {connectionState === 'connected' ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
          </button>
      </div>

      {/* --- COLLAPSIBLE SETTINGS BAR --- */}
      <div className={`absolute bottom-0 left-0 w-full bg-black/80 backdrop-blur-xl border-t border-gray-800 transition-transform duration-300 z-50 ${showSettings ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="p-4 flex flex-col gap-4">
              
              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                  <h3 className="text-white font-bold flex items-center gap-2 text-sm"><Settings className="w-4 h-4 text-cyan-500" /> SETTINGS</h3>
                  <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-800 rounded"><ChevronDown className="w-5 h-5 text-gray-500" /></button>
              </div>

              {/* Character Selector - Horizontal Scroll */}
              <div>
                  <label className="text-[10px] text-gray-500 mb-2 block uppercase tracking-widest">Select Persona</label>
                  <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar snap-x">
                      {[...CHARACTERS].map(char => (
                          <button
                            key={char.id}
                            onClick={() => setActiveCharacter(char)}
                            className={`flex-shrink-0 snap-center flex flex-col items-center gap-2 min-w-[80px] group transition-all`}
                          >
                              <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all ${
                                  activeCharacter.id === char.id 
                                  ? `border-${char.themeColor}-500 bg-${char.themeColor}-900/50 shadow-[0_0_10px_currentColor] text-${char.themeColor}-400`
                                  : 'border-gray-700 bg-gray-900 text-gray-600 group-hover:border-gray-500 group-hover:text-gray-400'
                              }`}>
                                  <User className="w-6 h-6" />
                              </div>
                              <span className={`text-[10px] font-bold truncate max-w-full px-2 py-0.5 rounded-full ${
                                  activeCharacter.id === char.id
                                  ? `text-${char.themeColor}-400 bg-${char.themeColor}-900/30`
                                  : 'text-gray-500'
                              }`}>
                                  {char.name}
                              </span>
                          </button>
                      ))}
                  </div>
              </div>

              {/* Background Options */}
              <div className="flex items-center justify-between">
                   <div className="flex gap-2">
                      <button onClick={() => setBgType('solid')} className={`p-2 rounded-lg border ${bgType==='solid' ? 'bg-white text-black border-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}><Palette className="w-4 h-4"/></button>
                      <button onClick={() => setBgType('gradient')} className={`p-2 rounded-lg border ${bgType==='gradient' ? 'bg-white text-black border-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}><Maximize className="w-4 h-4"/></button>
                      <button onClick={() => setBgType('image')} className={`p-2 rounded-lg border ${bgType==='image' ? 'bg-white text-black border-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}><ImageIcon className="w-4 h-4"/></button>
                   </div>

                   {bgType === 'image' && (
                       <label className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 text-xs border border-gray-700">
                              <Upload className="w-3 h-3" /> Set BG Image
                              <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'bg')} />
                       </label>
                   )}
                   {bgType === 'solid' && (
                       <div className="flex items-center gap-2">
                           <input type="color" className="w-8 h-8 rounded cursor-pointer bg-transparent border-none" onChange={(e) => setBgValue(e.target.value)} />
                       </div>
                   )}
                   
                   <label className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 text-xs border border-gray-700 ml-auto bg-cyan-900/30 text-cyan-400 border-cyan-500/50 shadow-sm animate-pulse">
                        <Upload className="w-3 h-3" /> Set Avatar
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'avatar')} />
                   </label>
              </div>

          </div>
      </div>
    </div>
  );
};

export default AvatarOverlay;