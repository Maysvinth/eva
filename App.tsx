import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Mic, MicOff, Settings, Terminal, Activity, Zap, Cloud, Key, Smartphone, Monitor, EyeOff, QrCode, Wifi, Laptop, Volume2, Power, ArrowRight, Play, Pause, SkipForward, SkipBack, Octagon, Users, Moon } from 'lucide-react';
import AvatarVisualizer from './components/AvatarVisualizer';
import { ChatHistory } from './components/ChatHistory';
import { useGeminiLive } from './hooks/useGeminiLive';
import { useDevicePairing } from './hooks/useDevicePairing';
import { CHARACTERS, VOICE_LIBRARY } from './constants';
import { CharacterProfile, VoiceName } from './types';

const App: React.FC = () => {
  const [activeCharacter, setActiveCharacter] = useState<CharacterProfile>(() => {
    const savedId = localStorage.getItem('eva_active_character_id');
    const overrides = JSON.parse(localStorage.getItem('eva_voice_overrides') || '{}');
    let found = CHARACTERS.find(c => c.id === savedId) || CHARACTERS[0];
    if (overrides[found.id]) {
        const voiceName = overrides[found.id] as VoiceName;
        const voiceData = VOICE_LIBRARY.find(v => v.name === voiceName);
        if (voiceData) {
            found = { ...found, voiceName: voiceName, themeColor: voiceData.themeColor, visualizerColor: voiceData.hexColor };
        }
    }
    return found;
  });

  const [characterOrder, setCharacterOrder] = useState<string[]>(() => {
      const savedOrder = localStorage.getItem('eva_character_order');
      const allIds = CHARACTERS.map(c => c.id);
      if (savedOrder) return [...new Set([...JSON.parse(savedOrder), ...allIds])];
      return allIds;
  });

  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'personalities' | 'device_link' | 'voice'>('general');
  const [targetCodeInput, setTargetCodeInput] = useState('');
  const [isMediaPlaying, setIsMediaPlaying] = useState(false);
  
  const [wakeWord, setWakeWord] = useState<string>(() => localStorage.getItem('eva_wake_word') || '');
  const [stopWord, setStopWord] = useState<string>(() => localStorage.getItem('eva_stop_word') || 'Stop');
  const [alwaysOn, setAlwaysOn] = useState<boolean>(() => localStorage.getItem('eva_always_on') === 'true');

  const { role, pairingCode, connectionStatus: p2pStatus, initializeHost, connectToHost, sendCommand, disconnectP2P } = useDevicePairing();

  const volumeRef = useRef<number>(0);

  useEffect(() => {
    // Robust check for API Key in various locations
    const key = process.env.VITE_GEMINI_API_KEY || 
                process.env.API_KEY || 
                (import.meta as any).env?.VITE_GEMINI_API_KEY || 
                (import.meta as any).env?.API_KEY;
                
    if (!key) setApiKeyMissing(true);
  }, []);

  useEffect(() => {
    const overrides = JSON.parse(localStorage.getItem('eva_voice_overrides') || '{}');
    const defaultChar = CHARACTERS.find(c => c.id === activeCharacter.id);
    if (defaultChar && activeCharacter.voiceName !== defaultChar.voiceName) {
        overrides[activeCharacter.id] = activeCharacter.voiceName;
    } else {
        delete overrides[activeCharacter.id];
    }
    localStorage.setItem('eva_voice_overrides', JSON.stringify(overrides));
    localStorage.setItem('eva_active_character_id', activeCharacter.id);
  }, [activeCharacter]);
  
  useEffect(() => { localStorage.setItem('eva_always_on', String(alwaysOn)); }, [alwaysOn]);
  useEffect(() => { localStorage.setItem('eva_wake_word', wakeWord); }, [wakeWord]);
  useEffect(() => { localStorage.setItem('eva_stop_word', stopWord); }, [stopWord]);
  useEffect(() => { localStorage.setItem('eva_character_order', JSON.stringify(characterOrder)); }, [characterOrder]);

  const { connect, disconnect, connectionState, messages, streamingUserText, streamingModelText, error, isStandby } = useGeminiLive({
    character: activeCharacter,
    onVisualizerUpdate: (vol) => { volumeRef.current = vol; },
    isRemoteMode: role === 'remote',
    sendRemoteCommand: sendCommand,
    autoReconnect: alwaysOn,
    wakeWord: wakeWord,
    stopWord: stopWord,
    onMediaCommand: (cmd) => {
        if (cmd === 'play') setIsMediaPlaying(true);
        if (cmd === 'pause' || cmd === 'stop') setIsMediaPlaying(false);
    }
  });

  const handleToggleConnection = () => {
    if (connectionState === 'connected' || connectionState === 'connecting') {
      disconnect();
    } else {
      connect();
    }
  };
  
  const toggleAlwaysOn = () => setAlwaysOn(prev => !prev);

  const switchCharacter = (char: CharacterProfile) => {
      const overrides = JSON.parse(localStorage.getItem('eva_voice_overrides') || '{}');
      const savedVoiceName = overrides[char.id];
      let newCharState = char;
      if (savedVoiceName) {
         const voiceData = VOICE_LIBRARY.find(v => v.name === savedVoiceName);
         if (voiceData) newCharState = { ...char, voiceName: savedVoiceName, themeColor: voiceData.themeColor, visualizerColor: voiceData.hexColor };
      }
      setActiveCharacter(newCharState);
      setCharacterOrder(prev => [char.id, ...prev.filter(id => id !== char.id)]);
  };

  const handleVoiceSelection = (voiceName: VoiceName) => {
     const signatureCharacter = CHARACTERS.find(c => c.voiceName === voiceName);
     const voiceData = VOICE_LIBRARY.find(v => v.name === voiceName);
     if (signatureCharacter) {
        switchCharacter(signatureCharacter);
     } else if (voiceData) {
        setActiveCharacter(prev => ({ ...prev, voiceName: voiceName, themeColor: voiceData.themeColor, visualizerColor: voiceData.hexColor }));
     }
  };

  const orderedCharacters = useMemo(() => characterOrder.map(id => CHARACTERS.find(c => c.id === id)).filter((c): c is CharacterProfile => !!c), [characterOrder]);

  const handleMediaControl = (command: string) => {
      if (role === 'remote') {
          sendCommand('media_control', command);
      } else {
          let key = 'MediaPlayPause';
          if (command === 'next') key = 'MediaTrackNext';
          if (command === 'previous') key = 'MediaTrackPrevious';
          if (command === 'seek_forward') key = 'ArrowRight';
          if (command === 'seek_backward') key = 'ArrowLeft';
          try { document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true })); } catch(e) {}
      }
      if (command === 'play') setIsMediaPlaying(true);
      if (command === 'pause') setIsMediaPlaying(false);
  };

  const isRemote = role === 'remote';

  return (
    <div className="h-[100dvh] bg-[#050505] text-white flex flex-col font-sans selection:bg-cyan-500/30 overflow-hidden">
      
      {/* Header */}
      <header className="h-16 border-b border-gray-900 flex items-center justify-between px-3 md:px-6 bg-black/50 backdrop-blur-md fixed w-full z-50 top-0">
        <div className="flex items-center space-x-2">
          <Activity className={`w-5 h-5 ${connectionState === 'connected' ? 'text-green-500 animate-pulse' : connectionState === 'connecting' ? 'text-yellow-500 animate-spin' : 'text-gray-600'}`} />
          <h1 className="text-lg md:text-xl font-display tracking-widest font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-500 truncate max-w-[120px] md:max-w-none">
            PROJECT <span className={`text-${activeCharacter.themeColor}-500 transition-colors duration-500`}>EVA</span>
          </h1>
          {role === 'remote' && p2pStatus === 'connected' && (
             <span className="hidden sm:flex ml-2 px-2 py-0.5 rounded bg-blue-900/50 border border-blue-500/30 text-[10px] text-blue-300 font-mono items-center">
                <Wifi className="w-3 h-3 mr-1" /> LINKED
             </span>
          )}
          {role === 'host' && (
             <span className="hidden sm:flex ml-2 px-2 py-0.5 rounded bg-purple-900/50 border border-purple-500/30 text-[10px] text-purple-300 font-mono items-center">
                <Monitor className="w-3 h-3 mr-1" /> HOST
             </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2 md:space-x-4">
           <div className="flex bg-gray-900/80 rounded-full p-1 border border-gray-800 backdrop-blur-sm max-w-[120px] sm:max-w-[150px] md:max-w-none overflow-x-auto no-scrollbar">
             {orderedCharacters.map((char) => (
               <button
                 key={char.id}
                 onClick={() => switchCharacter(char)}
                 className={`relative px-3 py-1.5 md:px-4 rounded-full text-xs font-bold transition-all duration-300 flex items-center space-x-2 whitespace-nowrap ${
                   activeCharacter.id === char.id 
                     ? `bg-${char.themeColor}-900/40 text-${char.themeColor}-400 ring-1 ring-${char.themeColor}-500 shadow-[0_0_15px_rgba(0,0,0,0.3)]`
                     : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                 }`}
               >
                 <span>{char.name}</span>
                 {activeCharacter.id === char.id && (
                     <span className={`w-1.5 h-1.5 rounded-full bg-${char.themeColor}-500 animate-pulse`} />
                 )}
               </button>
             ))}
           </div>
           
           <button 
             onClick={() => setShowSettings(!showSettings)}
             className="p-2 hover:bg-gray-800 rounded-full transition-colors relative flex-shrink-0"
           >
             <Settings className="w-5 h-5 text-gray-400" />
             {p2pStatus === 'connected' && <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"></span>}
           </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex pt-16 h-full relative">
        <div className={`flex flex-col border-r border-gray-900 relative bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] 
            ${isRemote ? 'w-full' : 'w-full md:w-1/2 lg:w-2/5'}
        `}>
           <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black pointer-events-none opacity-80" />
           
           {/* Visualizer Container */}
           <div className="flex-1 flex items-center justify-center relative z-10 overflow-hidden">
              <div className="w-[260px] h-[260px] sm:w-[300px] sm:h-[300px] md:w-[400px] md:h-[400px] relative transition-all duration-500">
                 {/* Visualizer Borders */}
                 <div className={`absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-${activeCharacter.themeColor}-500/30 transition-colors duration-500`} />
                 <div className={`absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-${activeCharacter.themeColor}-500/30 transition-colors duration-500`} />
                 <div className={`absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-${activeCharacter.themeColor}-500/30 transition-colors duration-500`} />
                 <div className={`absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-${activeCharacter.themeColor}-500/30 transition-colors duration-500`} />
                 
                 {/* Voice Tag HUD */}
                 <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 text-[10px] font-mono tracking-widest bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-${activeCharacter.themeColor}-500/30 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all duration-500 flex items-center space-x-2 whitespace-nowrap z-20`}>
                    <span className="text-gray-500 hidden sm:inline">VOICE MODULE</span>
                    <div className={`w-1 h-1 bg-${activeCharacter.themeColor}-500 rounded-full animate-pulse`} />
                    <span 
                        className={`font-bold transition-colors duration-500 text-${activeCharacter.themeColor}-400 drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]`}
                        style={{ color: activeCharacter.visualizerColor }}
                    >
                        {activeCharacter.voiceName.toUpperCase()}
                    </span>
                 </div>
                 
                 {/* Standby Overlay */}
                 {isStandby && connectionState === 'connected' && (
                     <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                         <div className="bg-black/70 backdrop-blur-sm border border-amber-500/50 px-6 py-3 rounded-xl text-amber-500 font-mono tracking-widest animate-pulse flex flex-col items-center">
                             <Moon className="w-6 h-6 mb-2" />
                             <span>STANDBY MODE</span>
                             <span className="text-[10px] opacity-70 mt-1">LISTENING FOR "{wakeWord}"</span>
                         </div>
                     </div>
                 )}

                 <AvatarVisualizer 
                   volumeRef={volumeRef} 
                   color={activeCharacter.visualizerColor}
                   isActive={connectionState === 'connected' && !isStandby}
                 />
              </div>
           </div>

           {/* Controls */}
           <div className="p-4 sm:p-8 flex flex-col items-center justify-center space-y-4 z-20 pb-24 sm:pb-8">
              <div className="text-center mb-2 sm:mb-4">
                 <h2 className={`text-xl sm:text-2xl font-display font-bold text-${activeCharacter.themeColor}-500 tracking-wider transition-colors duration-500`}>
                   {activeCharacter.name}
                 </h2>
                 <p className="text-gray-500 text-xs sm:text-sm font-mono mt-1">
                   STATUS: <span className={
                     connectionState === 'connected' ? (isStandby ? 'text-amber-500' : 'text-green-500') : 
                     connectionState === 'connecting' ? 'text-yellow-500' :
                     connectionState === 'error' ? 'text-red-500' : 'text-gray-500'
                   }>{connectionState === 'connected' && isStandby ? 'STANDBY' : connectionState.toUpperCase()}</span>
                 </p>
                 {wakeWord && (
                     <p className="text-[10px] text-gray-600 font-mono mt-1 uppercase tracking-widest truncate max-w-[200px]">
                         Wake: <span className="text-white">{wakeWord}</span>
                     </p>
                 )}
              </div>

              {/* Main Mic & Always On */}
              <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={handleToggleConnection}
                    disabled={apiKeyMissing}
                    className={`
                      group relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 transition-all duration-300
                      ${connectionState === 'connected' 
                        ? (isStandby 
                            ? `border-amber-500/50 bg-amber-900/10` 
                            : `border-${activeCharacter.themeColor}-500/50 bg-${activeCharacter.themeColor}-900/10 hover:bg-${activeCharacter.themeColor}-900/30`)
                        : `border-${activeCharacter.themeColor}-500/50 bg-${activeCharacter.themeColor}-900/10 hover:bg-${activeCharacter.themeColor}-900/30`}
                      ${apiKeyMissing ? 'opacity-50 cursor-not-allowed' : ''}
                      ${connectionState === 'connecting' ? 'animate-pulse' : ''}
                    `}
                  >
                     {connectionState === 'connected' ? (
                        isStandby ? <Moon className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500" /> : <MicOff className={`w-6 h-6 sm:w-8 sm:h-8 text-${activeCharacter.themeColor}-400`} />
                     ) : (
                        <Mic className={`w-6 h-6 sm:w-8 sm:h-8 text-${activeCharacter.themeColor}-400 group-hover:scale-110 transition-transform`} />
                     )}
                     {connectionState === 'connected' && !isStandby && (
                        <span className={`absolute inset-0 rounded-full border border-${activeCharacter.themeColor}-500 animate-ping opacity-20`}></span>
                     )}
                  </button>

                  <button 
                      onClick={toggleAlwaysOn}
                      className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-xs font-mono transition-all duration-300 ${
                          alwaysOn 
                           ? `bg-${activeCharacter.themeColor}-900/20 border-${activeCharacter.themeColor}-500 text-${activeCharacter.themeColor}-400 shadow-[0_0_10px_rgba(0,0,0,0.3)]` 
                           : 'bg-gray-900 border-gray-700 text-gray-500 hover:bg-gray-800'
                      }`}
                  >
                      <Power className={`w-3 h-3 ${alwaysOn ? 'fill-current' : ''}`} />
                      <span>ALWAYS ON: {alwaysOn ? 'ON' : 'OFF'}</span>
                  </button>
              </div>

              {/* Media Control Widget */}
              <div className="mt-4 flex items-center justify-center gap-4 animate-fade-in">
                   <button 
                     onClick={() => handleMediaControl('seek_backward')}
                     className={`p-2 rounded-full border border-${activeCharacter.themeColor}-900 text-gray-500 hover:text-${activeCharacter.themeColor}-400 hover:border-${activeCharacter.themeColor}-500/50 transition-all`}
                   >
                      <SkipBack className="w-4 h-4" />
                   </button>
                   
                   <button 
                     onClick={() => handleMediaControl(isMediaPlaying ? 'pause' : 'play')}
                     className={`
                        w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 relative group
                        border-${activeCharacter.themeColor}-500/30 hover:border-${activeCharacter.themeColor}-500
                        ${streamingModelText ? 'animate-spin-slow' : ''}
                     `}
                   >
                      {isMediaPlaying ? (
                          <Pause className={`w-4 h-4 sm:w-5 sm:h-5 text-${activeCharacter.themeColor}-400`} />
                      ) : (
                          <Play className={`w-4 h-4 sm:w-5 sm:h-5 text-${activeCharacter.themeColor}-400 ml-1`} />
                      )}
                      {streamingModelText && (
                          <span className={`absolute inset-0 border-t-2 border-${activeCharacter.themeColor}-500 rounded-full animate-spin`}></span>
                      )}
                   </button>

                   <button 
                     onClick={() => handleMediaControl('seek_forward')}
                     className={`p-2 rounded-full border border-${activeCharacter.themeColor}-900 text-gray-500 hover:text-${activeCharacter.themeColor}-400 hover:border-${activeCharacter.themeColor}-500/50 transition-all`}
                   >
                      <SkipForward className="w-4 h-4" />
                   </button>
              </div>
              
              <div className="text-xs text-gray-600 font-mono mt-2">
                {apiKeyMissing ? "API KEY REQUIRED" : "CLICK TO INITIALIZE LINK"}
              </div>
           </div>
        </div>

        {/* Right Panel: Chat & Logs */}
        <div className={`flex-col w-1/2 lg:w-3/5 bg-black relative ${isRemote ? '!hidden' : 'hidden md:flex'}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-900 to-transparent opacity-50" />
          
          <div className="p-4 border-b border-gray-900 flex justify-between items-center bg-gray-900/20">
             <div className="flex items-center space-x-2 text-gray-400">
               <Terminal className="w-4 h-4" />
               <span className="text-xs font-mono uppercase tracking-wider">Communication Log</span>
             </div>
             <div className="flex space-x-4 text-xs text-gray-500 font-mono">
                <span className="flex items-center"><Cloud className="w-3 h-3 mr-1" /> GEMINI LIVE</span>
                <span className="flex items-center"><Zap className="w-3 h-3 mr-1" /> LOW LATENCY</span>
             </div>
          </div>

          <ChatHistory 
             messages={messages} 
             streamingUserText={streamingUserText}
             streamingModelText={streamingModelText}
          />

          {error && (
            <div className="p-4 bg-red-900/20 border-t border-red-900/50 text-red-400 text-sm font-mono">
              ERROR: {error}
            </div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-2xl w-full flex flex-col shadow-2xl relative overflow-hidden">
            <div className="p-4 md:p-6 border-b border-gray-800 flex justify-between items-center bg-gray-950">
               <h3 className="text-lg md:text-xl font-display font-bold text-white flex items-center">
                 <Settings className="w-4 h-4 md:w-5 md:h-5 mr-2 text-cyan-500" /> 
                 SYSTEM CONFIG
               </h3>
               <button onClick={() => setShowSettings(false)} className="px-3 bg-gray-800 rounded text-xs text-gray-400">HIDE</button>
            </div>
            
            <div className="p-6 text-center text-gray-500">
                (Settings are currently disabled in this simplified view)
                <button 
                     onClick={() => setShowSettings(false)}
                     className="mt-4 px-4 py-2 bg-red-900/50 text-red-300 rounded"
                >
                    Close Settings
                </button>
            </div>
          </div>
        </div>
      )}

      {apiKeyMissing && (
         <div className="fixed bottom-0 left-0 right-0 bg-red-900/90 text-white p-4 text-center z-[100] font-bold">
           CRITICAL: API_KEY NOT DETECTED. SYSTEM HALTED.
         </div>
      )}
    </div>
  );
};

export default App;