import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Mic, MicOff, Settings, Terminal, Activity, Zap, Cloud, Key, Smartphone, Monitor, EyeOff, QrCode, Wifi, Laptop, Volume2, Power, ArrowRight, Play, Pause, SkipForward, SkipBack, Octagon, Users, Moon, Cable, Leaf, Lock, Globe, Music, Youtube, AppWindow, PlayCircle, CheckCircle } from 'lucide-react';
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
  const [settingsTab, setSettingsTab] = useState<'general' | 'personalities' | 'device_link' | 'voice'>('general');
  const [voiceFilter, setVoiceFilter] = useState<'All' | 'Male' | 'Female'>('All');
  const [targetCodeInput, setTargetCodeInput] = useState('');
  const [isMediaPlaying, setIsMediaPlaying] = useState(false);
  
  // HUD State
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [wakeWord, setWakeWord] = useState<string>(() => localStorage.getItem('eva_wake_word') || '');
  const [stopWord, setStopWord] = useState<string>(() => localStorage.getItem('eva_stop_word') || 'Stop');
  const [alwaysOn, setAlwaysOn] = useState<boolean>(() => localStorage.getItem('eva_always_on') === 'true');
  const [isLowLatency, setIsLowLatency] = useState<boolean>(() => localStorage.getItem('eva_low_latency') === 'true');
  
  // AUTO-DETECT ECO MODE: If device has <= 4 cores, default to true if not set
  const [isEcoMode, setIsEcoMode] = useState<boolean>(() => {
      const saved = localStorage.getItem('eva_eco_mode');
      if (saved !== null) return saved === 'true';
      return navigator.hardwareConcurrency <= 4;
  });

  // New State for Voice Selection Confirmation
  const [pendingVoiceName, setPendingVoiceName] = useState<string | null>(null);

  // Notification / Feedback State
  const [feedback, setFeedback] = useState<{ message: string, icon: React.ReactNode, type: 'success' | 'info' } | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((message: string, icon: React.ReactNode = <Activity className="w-4 h-4"/>, type: 'success' | 'info' = 'info') => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      setFeedback({ message, icon, type });
      feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 3000);
  }, []);

  const handleRemoteCommand = useCallback((action: string, query: string) => {
       if (action === 'open_url') showFeedback(`Remote: Opening Link`, <Globe className="w-4 h-4 text-cyan-400"/>);
       else if (action === 'play_music') showFeedback(`Remote: Playing ${query}`, <Music className="w-4 h-4 text-purple-400"/>);
       else if (action === 'media_control') showFeedback(`Remote Control: ${query.toUpperCase()}`, <PlayCircle className="w-4 h-4 text-green-400"/>);
       else if (action === 'open_app') showFeedback(`Remote: Launching ${query}`, <AppWindow className="w-4 h-4 text-blue-400"/>);
       else if (action === 'play_video') showFeedback(`Remote: Playing Video`, <Youtube className="w-4 h-4 text-red-400"/>);
  }, [showFeedback]);

  const { role, pairingCode, connectionStatus: p2pStatus, initializeHost, connectToHost, sendCommand, disconnectP2P } = useDevicePairing({
      onCommandReceived: handleRemoteCommand
  });

  const volumeRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Wake Lock Implementation for "Always On" devices
  useEffect(() => {
    const requestWakeLock = async () => {
        if ('wakeLock' in navigator && alwaysOn) {
            try {
                const lock = await navigator.wakeLock.request('screen');
                wakeLockRef.current = lock;
                lock.addEventListener('release', () => {
                    if (alwaysOn && document.visibilityState === 'visible') requestWakeLock();
                });
            } catch (err) {
                console.log('Wake Lock denied:', err);
            }
        }
    };

    if (alwaysOn) {
        requestWakeLock();
    } else {
        wakeLockRef.current?.release().catch(() => {});
        wakeLockRef.current = null;
    }
    return () => { wakeLockRef.current?.release().catch(() => {}); };
  }, [alwaysOn]);

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
  useEffect(() => { localStorage.setItem('eva_low_latency', String(isLowLatency)); }, [isLowLatency]);
  useEffect(() => { localStorage.setItem('eva_eco_mode', String(isEcoMode)); }, [isEcoMode]);
  useEffect(() => { localStorage.setItem('eva_character_order', JSON.stringify(characterOrder)); }, [characterOrder]);

  const handleToolExecution = useCallback((toolName: string, args: any) => {
      if (toolName === 'executeRemoteAction') {
          const action = args.action;
          const query = args.query;
          if (action === 'open_url') showFeedback(`Opening: ${query}`, <Globe className="w-4 h-4 text-cyan-400"/>);
          else if (action === 'play_music') showFeedback(`Music: ${query}`, <Music className="w-4 h-4 text-purple-400"/>);
          else if (action === 'play_video') showFeedback(`Video: ${query}`, <Youtube className="w-4 h-4 text-red-400"/>);
          else if (action === 'open_app') showFeedback(`Launching: ${query}`, <AppWindow className="w-4 h-4 text-blue-400"/>);
      } else if (toolName === 'controlMedia') {
          const cmd = args.command;
          showFeedback(`Media: ${cmd.toUpperCase()}`, <PlayCircle className="w-4 h-4 text-green-400"/>);
      }
  }, [showFeedback]);

  const { connect, disconnect, connectionState, messages, error, isStandby } = useGeminiLive({
    character: activeCharacter,
    onVisualizerUpdate: (vol) => { 
        volumeRef.current = vol; 
        
        // --- VOICE DETECTION FOR HUD ---
        if (vol > 0.05) { // Sensitivity threshold
             if (!isVoiceDetected) {
                 setIsVoiceDetected(true);
             }
             if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
             voiceTimeoutRef.current = setTimeout(() => {
                 setIsVoiceDetected(false);
             }, 300); // 300ms delay to prevent flickering
        }
    },
    isRemoteMode: role === 'remote',
    sendRemoteCommand: sendCommand,
    autoReconnect: alwaysOn,
    wakeWord: wakeWord,
    stopWord: stopWord,
    isLowLatencyMode: isLowLatency,
    isEcoMode: isEcoMode,
    onToolExecuted: handleToolExecution,
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
  const toggleLowLatency = () => setIsLowLatency(prev => !prev);
  const toggleEcoMode = () => setIsEcoMode(prev => !prev);

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
     if (voiceData) {
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
    <div className={`h-[100dvh] bg-[#050505] text-white flex flex-col font-sans selection:bg-cyan-500/30 overflow-hidden relative transition-colors duration-1000`}>
      
      {/* DYNAMIC THEME BACKGROUND GLOW */}
      <div className={`absolute inset-0 bg-gradient-to-br from-${activeCharacter.themeColor}-900/20 via-transparent to-black pointer-events-none transition-all duration-1000`} />
      
      {/* STATUS HUD OVERLAY */}
      <div className="fixed top-0 left-0 w-full z-[100] pointer-events-none flex justify-center items-start p-2">
          {/* Top Bar Container */}
          <div className="flex items-center gap-4 bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/5 shadow-lg mt-1">
              {/* Running Indicator */}
              <div className={`flex items-center gap-2 transition-all duration-300 ${connectionState === 'connected' ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                  <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-white/80">RUNNING</span>
              </div>

              {/* Listening Indicator */}
              <div className={`flex items-center gap-2 border-l border-white/10 pl-4 transition-all duration-150 ${isVoiceDetected ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                  <Mic className="w-3 h-3 text-cyan-400 animate-pulse" />
                  <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-400 shadow-cyan-400/20">LISTENING</span>
              </div>
          </div>

          {/* Settings Button - Absolute Right Corner */}
          <div className="absolute top-3 right-4 pointer-events-auto">
             <button 
               onClick={() => setShowSettings(!showSettings)}
               className="p-2 hover:bg-gray-800/80 rounded-full transition-colors bg-black/40 border border-white/10 backdrop-blur-sm group"
               aria-label="Settings"
             >
               <Settings className={`w-5 h-5 text-gray-400 group-hover:text-white transition-transform duration-500 ${showSettings ? 'rotate-90' : ''}`} />
             </button>
          </div>
      </div>

      {/* Feedback Toast Notification */}
      {feedback && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[100] animate-fade-in-up">
              <div className="bg-gray-900/90 backdrop-blur-md border border-gray-700/50 rounded-full px-6 py-3 shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center space-x-3">
                  <div className="p-1.5 rounded-full bg-gray-800 border border-gray-700">
                      {feedback.icon}
                  </div>
                  <span className="text-sm font-mono text-gray-200 tracking-wide">{feedback.message}</span>
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_currentColor]" />
              </div>
          </div>
      )}

      {/* Header - SIMPLIFIED / HIDDEN BY DEFAULT AS PER REQUEST FOR MINIMAL OVERLAY */}
      {/* We keep the character selector visible but pushed down or minimal */}
      <div className="absolute top-16 left-0 w-full z-40 flex justify-center pointer-events-none">
           <div className="pointer-events-auto flex bg-gray-900/40 rounded-full p-1 border border-white/5 backdrop-blur-sm overflow-x-auto no-scrollbar max-w-[90vw]">
             {orderedCharacters.map((char) => (
               <button
                 key={char.id}
                 onClick={() => switchCharacter(char)}
                 className={`relative px-3 py-1.5 rounded-full text-[10px] font-bold transition-all duration-300 flex items-center space-x-2 whitespace-nowrap ${
                   activeCharacter.id === char.id 
                     ? `bg-${char.themeColor}-900/40 text-${char.themeColor}-400 ring-1 ring-${char.themeColor}-500 shadow-[0_0_10px_rgba(0,0,0,0.3)]`
                     : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                 }`}
               >
                 <span>{char.name}</span>
               </button>
             ))}
           </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex pt-16 h-full relative">
        <div className={`flex flex-col border-r border-gray-900/50 relative 
            ${isRemote ? 'w-full' : 'w-full md:w-1/2 lg:w-2/5'}
        `}>
           
           {/* Visualizer Container - Static Mode */}
           <div className="flex-1 flex items-center justify-center relative z-10 overflow-hidden">
              <div className="w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] md:w-[400px] md:h-[400px] relative transition-all duration-500">
                 
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
                   ecoMode={isEcoMode}
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
                   {connectionState === 'connected' ? (isStandby ? 'STANDBY' : 'ONLINE') : connectionState.toUpperCase()}
                 </p>
              </div>

              {/* Main Mic & Always On */}
              <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={handleToggleConnection}
                    className={`
                      group relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 transition-all duration-300
                      ${connectionState === 'connected' 
                        ? (isStandby 
                            ? `border-amber-500/50 bg-amber-900/10` 
                            : `border-${activeCharacter.themeColor}-500/50 bg-${activeCharacter.themeColor}-900/10 hover:bg-${activeCharacter.themeColor}-900/30`)
                        : `border-${activeCharacter.themeColor}-500/50 bg-${activeCharacter.themeColor}-900/10 hover:bg-${activeCharacter.themeColor}-900/30`}
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
              </div>
           </div>
        </div>

        {/* Right Panel: Chat & Logs */}
        <div className={`flex-col w-1/2 lg:w-3/5 bg-black/50 relative ${isRemote ? '!hidden' : 'hidden md:flex'}`}>
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-900 to-transparent opacity-50" />
          
          <div className="p-4 border-b border-gray-900 flex justify-between items-center bg-gray-900/20">
             <div className="flex items-center space-x-2 text-gray-400">
               <Terminal className="w-4 h-4" />
               <span className="text-xs font-mono uppercase tracking-wider">Communication Log</span>
             </div>
             <div className="flex space-x-4 text-xs text-gray-500 font-mono">
                <span className="flex items-center"><Cloud className="w-3 h-3 mr-1" /> GEMINI LIVE</span>
                <span className="flex items-center"><Zap className="w-3 h-3 mr-1" /> {isLowLatency ? 'TURBO' : 'STANDARD'}</span>
             </div>
          </div>

          <ChatHistory messages={messages} />

          {error && (
            <div className="p-4 bg-red-900/20 border-t border-red-900/50 text-red-400 text-sm font-mono">
              ERROR: {error}
            </div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-4xl w-full h-[600px] flex shadow-2xl relative overflow-hidden flex-col md:flex-row">
            
            {/* Sidebar */}
            <div className="w-full md:w-64 bg-black/40 border-r border-gray-800 p-4 flex flex-col space-y-2">
               <h3 className="text-xl font-display font-bold text-white mb-6 flex items-center">
                 <Settings className="w-5 h-5 mr-2 text-cyan-500" /> CONFIG
               </h3>
               
               <button 
                 onClick={() => setSettingsTab('general')}
                 className={`text-left px-4 py-3 rounded-lg flex items-center space-x-3 transition-colors ${settingsTab === 'general' ? 'bg-cyan-900/20 text-cyan-400 border border-cyan-900' : 'text-gray-400 hover:bg-gray-800'}`}
               >
                 <Settings className="w-4 h-4" />
                 <span>General</span>
               </button>

               <button 
                 onClick={() => setSettingsTab('device_link')}
                 className={`text-left px-4 py-3 rounded-lg flex items-center space-x-3 transition-colors ${settingsTab === 'device_link' ? 'bg-purple-900/20 text-purple-400 border border-purple-900' : 'text-gray-400 hover:bg-gray-800'}`}
               >
                 <Wifi className="w-4 h-4" />
                 <span>Device Link</span>
               </button>

               <button 
                 onClick={() => setSettingsTab('voice')}
                 className={`text-left px-4 py-3 rounded-lg flex items-center space-x-3 transition-colors ${settingsTab === 'voice' ? 'bg-pink-900/20 text-pink-400 border border-pink-900' : 'text-gray-400 hover:bg-gray-800'}`}
               >
                 <Volume2 className="w-4 h-4" />
                 <span>Voices</span>
               </button>

                <div className="flex-1" />
                <button onClick={() => setShowSettings(false)} className="px-4 py-3 text-gray-500 hover:text-white text-left text-sm">
                    Close Menu
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-gray-900/50 p-6 overflow-y-auto">
               
               {/* GENERAL TAB */}
               {settingsTab === 'general' && (
                   <div className="space-y-6 animate-fade-in">
                       <h4 className="text-lg font-bold text-white border-b border-gray-800 pb-2">Voice Protocols</h4>
                       
                       <div className="space-y-4">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div>
                                   <label className="block text-xs text-gray-500 mb-1 uppercase font-mono">Wake Word</label>
                                   <input 
                                     type="text" 
                                     value={wakeWord}
                                     onChange={(e) => setWakeWord(e.target.value)}
                                     placeholder="e.g. Hey Eva"
                                     className="w-full bg-black border border-gray-700 rounded p-2 text-white focus:border-cyan-500 focus:outline-none"
                                   />
                                   <p className="text-[10px] text-gray-600 mt-1">Leave empty to disable. Say this to wake from standby.</p>
                               </div>
                               <div>
                                   <label className="block text-xs text-gray-500 mb-1 uppercase font-mono">Stop Word</label>
                                   <input 
                                     type="text" 
                                     value={stopWord}
                                     onChange={(e) => setStopWord(e.target.value)}
                                     placeholder="e.g. Stop"
                                     className="w-full bg-black border border-gray-700 rounded p-2 text-white focus:border-red-500 focus:outline-none"
                                   />
                                   <p className="text-[10px] text-gray-600 mt-1">Emergency phrase to immediately silence the AI.</p>
                               </div>
                           </div>

                           <div className="p-4 bg-gray-800/30 rounded border border-gray-800 flex items-center justify-between">
                               <div>
                                   <div className="font-bold text-sm text-gray-200">Always On / Wake Lock</div>
                                   <div className="text-xs text-gray-500">Prevents Android "Doze" mode. Keep screen active.</div>
                               </div>
                               <button 
                                 onClick={() => setAlwaysOn(!alwaysOn)}
                                 className={`w-12 h-6 rounded-full p-1 transition-colors ${alwaysOn ? 'bg-green-600' : 'bg-gray-700'}`}
                               >
                                   <div className={`w-4 h-4 bg-white rounded-full transition-transform ${alwaysOn ? 'translate-x-6' : 'translate-x-0'}`} />
                               </button>
                           </div>

                           <div className="p-4 bg-yellow-900/10 rounded border border-yellow-700/30 flex items-center justify-between">
                               <div>
                                   <div className="font-bold text-sm text-yellow-500 flex items-center"><Zap className="w-4 h-4 mr-2"/> Turbo / Wired Mode</div>
                                   <div className="text-xs text-gray-400">Optimizes for USB Tethering or high-speed connections.<br/>Reduces latency buffers for instant response.</div>
                               </div>
                               <button 
                                 onClick={toggleLowLatency}
                                 className={`w-12 h-6 rounded-full p-1 transition-colors ${isLowLatency ? 'bg-yellow-600' : 'bg-gray-700'}`}
                               >
                                   <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isLowLatency ? 'translate-x-6' : 'translate-x-0'}`} />
                               </button>
                           </div>

                           <div className="p-4 bg-green-900/10 rounded border border-green-700/30 flex items-center justify-between">
                               <div>
                                   <div className="font-bold text-sm text-green-500 flex items-center"><Leaf className="w-4 h-4 mr-2"/> Eco / Stability Mode</div>
                                   <div className="text-xs text-gray-400">
                                       Essential for older devices (Galaxy M2, etc).<br/>
                                       <ul className="list-disc list-inside mt-1 space-y-0.5">
                                           <li>Reduces animation FPS (20fps).</li>
                                           <li>Skips silence packets (saves upload bandwidth).</li>
                                           <li>Aggressive audio buffer pruning.</li>
                                       </ul>
                                   </div>
                               </div>
                               <button 
                                 onClick={toggleEcoMode}
                                 className={`w-12 h-6 rounded-full p-1 transition-colors ${isEcoMode ? 'bg-green-600' : 'bg-gray-700'}`}
                               >
                                   <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isEcoMode ? 'translate-x-6' : 'translate-x-0'}`} />
                               </button>
                           </div>
                       </div>
                   </div>
               )}

               {/* VOICE TAB */}
               {settingsTab === 'voice' && (
                   <div className="space-y-6 animate-fade-in">
                       <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                           <h4 className="text-lg font-bold text-white">Neural Voice Module</h4>
                           <div className="flex bg-black border border-gray-800 rounded-lg p-1">
                               {['All', 'Male', 'Female'].map((f) => (
                                   <button
                                       key={f}
                                       onClick={() => setVoiceFilter(f as any)}
                                       className={`px-3 py-1 text-xs rounded-md transition-all ${
                                           voiceFilter === f 
                                           ? 'bg-gray-700 text-white shadow-sm' 
                                           : 'text-gray-500 hover:text-gray-300'
                                       }`}
                                   >
                                       {f}
                                   </button>
                               ))}
                           </div>
                       </div>

                       <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                           {VOICE_LIBRARY.filter(v => voiceFilter === 'All' || v.gender === voiceFilter).map((voice) => {
                               const isActive = activeCharacter.voiceName === voice.name;
                               const isPending = pendingVoiceName === voice.name;
                               
                               return (
                                   <button
                                       key={voice.name}
                                       onClick={() => {
                                           if (isActive) return;
                                           if (isPending) {
                                               handleVoiceSelection(voice.name);
                                               setPendingVoiceName(null);
                                           } else {
                                               setPendingVoiceName(voice.name);
                                           }
                                       }}
                                       className={`relative p-3 rounded-xl border text-left transition-all duration-300 group overflow-hidden ${
                                           isActive 
                                           ? `bg-${voice.themeColor}-900/20 border-${voice.themeColor}-500 ring-1 ring-${voice.themeColor}-500 shadow-[0_0_15px_rgba(0,0,0,0.2)]` 
                                           : isPending
                                               ? `bg-gray-800 border-gray-400 ring-1 ring-white/50` 
                                               : `bg-black/40 border-gray-800 hover:border-${voice.themeColor}-500/50 hover:bg-gray-900`
                                       }`}
                                   >
                                       <div className="flex justify-between items-start mb-2">
                                           <span className={`font-bold font-display tracking-wide transition-colors ${
                                               isActive ? `text-${voice.themeColor}-400` : isPending ? 'text-white' : `text-${voice.themeColor}-400 group-hover:text-${voice.themeColor}-300`
                                           }`}>
                                               {voice.name}
                                           </span>
                                           {isActive && (
                                               <div className={`w-2 h-2 rounded-full bg-${voice.themeColor}-500 animate-pulse shadow-[0_0_8px_currentColor]`} />
                                           )}
                                           {isPending && !isActive && (
                                                <span className="text-[9px] bg-white text-black px-1.5 py-0.5 rounded font-bold uppercase animate-pulse">
                                                    CONFIRM
                                                </span>
                                           )}
                                       </div>
                                       
                                       <div className="flex items-center space-x-2 mb-2">
                                           <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-${voice.themeColor}-900/30 text-${voice.themeColor}-300/70 border border-${voice.themeColor}-500/20`}>
                                               {voice.gender}
                                           </span>
                                       </div>
                                       
                                       <p className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors line-clamp-2 leading-relaxed">
                                           {voice.description}
                                       </p>
                                       
                                       {/* Hover Gradient */}
                                       <div className={`absolute inset-0 bg-gradient-to-br from-${voice.themeColor}-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
                                   </button>
                               );
                           })}
                       </div>
                   </div>
               )}

               {/* DEVICE LINK TAB */}
               {settingsTab === 'device_link' && (
                   <div className="space-y-6 animate-fade-in">
                       <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                           <h4 className="text-lg font-bold text-white">Neural Link (P2P)</h4>
                           <span className={`text-xs px-2 py-1 rounded border ${
                               p2pStatus === 'connected' ? 'bg-green-900/20 border-green-500 text-green-400' : 
                               p2pStatus === 'connecting' ? 'bg-yellow-900/20 border-yellow-500 text-yellow-400' :
                               'bg-gray-800 border-gray-600 text-gray-400'
                           }`}>
                               STATUS: {p2pStatus.toUpperCase()}
                           </span>
                       </div>

                        {/* Wired Connection Guide */}
                        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 mb-6">
                            <div className="flex items-center text-cyan-400 mb-2 font-bold text-sm">
                                <Cable className="w-4 h-4 mr-2" /> WIRED USB CONNECTION GUIDE
                            </div>
                            <ol className="list-decimal list-inside text-xs text-gray-400 space-y-1 font-mono">
                                <li>Connect Phone to Laptop via USB Data Cable.</li>
                                <li>Phone Settings: Enable <strong>USB Tethering</strong> (Hotspot & Tethering).</li>
                                <li>Laptop: Ensure network is connected via the NDIS/Ethernet adapter.</li>
                                <li>Go to "General" tab and enable <strong>Turbo / Wired Mode</strong> for zero latency.</li>
                            </ol>
                        </div>

                       {role === 'standalone' && (
                           <div className="grid grid-cols-1 gap-6">
                               {/* Host Card */}
                               <div className="p-6 bg-gradient-to-br from-purple-900/20 to-black border border-purple-500/30 rounded-xl hover:border-purple-500/60 transition-colors">
                                   <div className="flex items-center mb-4 text-purple-400">
                                       <Monitor className="w-6 h-6 mr-3" />
                                       <h5 className="font-bold text-lg">Desktop Host Mode</h5>
                                   </div>
                                   <p className="text-sm text-gray-400 mb-4">
                                       Turn this device into a "Host". It will execute commands (open apps, play music) received from a remote controller.
                                   </p>
                                   <button 
                                     onClick={initializeHost}
                                     className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded shadow-[0_0_15px_rgba(147,51,234,0.3)] transition-all"
                                   >
                                       INITIALIZE HOST
                                   </button>
                               </div>

                               {/* Remote Card */}
                               <div className="p-6 bg-gradient-to-br from-blue-900/20 to-black border border-blue-500/30 rounded-xl hover:border-blue-500/60 transition-colors">
                                   <div className="flex items-center mb-4 text-blue-400">
                                       <Smartphone className="w-6 h-6 mr-3" />
                                       <h5 className="font-bold text-lg">Remote Controller Mode</h5>
                                   </div>
                                   <p className="text-sm text-gray-400 mb-4">
                                       Connect to an existing Host. You will act as the microphone and brain, sending commands to the Host.
                                   </p>
                                   <div className="flex space-x-2">
                                       <input 
                                         type="text" 
                                         placeholder="Enter Host Code"
                                         value={targetCodeInput}
                                         onChange={(e) => setTargetCodeInput(e.target.value.toUpperCase())}
                                         maxLength={4}
                                         className="flex-1 bg-black border border-gray-700 rounded px-4 py-2 text-center tracking-[0.5em] font-mono text-lg uppercase focus:border-blue-500 focus:outline-none"
                                       />
                                       <button 
                                         onClick={() => connectToHost(targetCodeInput)}
                                         disabled={targetCodeInput.length !== 4}
                                         className="px-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded"
                                       >
                                           LINK
                                       </button>
                                   </div>
                               </div>
                           </div>
                       )}

                       {role === 'host' && (
                           <div className="flex flex-col items-center justify-center py-10 space-y-6">
                               <div className="w-32 h-32 bg-purple-900/20 rounded-full flex items-center justify-center animate-pulse border border-purple-500">
                                   <Monitor className="w-16 h-16 text-purple-400" />
                               </div>
                               <div className="text-center">
                                   <p className="text-gray-400 text-sm mb-2">PAIRING CODE</p>
                                   <div className="text-5xl font-mono font-bold text-white tracking-widest text-shadow-purple">
                                       {pairingCode}
                                   </div>
                               </div>
                               <p className="text-xs text-gray-500 max-w-xs text-center">
                                   Enter this code on your mobile device to establish a neural link.
                               </p>
                               <button onClick={disconnectP2P} className="px-6 py-2 border border-red-500/50 text-red-400 hover:bg-red-900/20 rounded">
                                   TERMINATE HOST
                               </button>
                           </div>
                       )}

                       {role === 'remote' && (
                           <div className="flex flex-col items-center justify-center py-10 space-y-6">
                               <div className="w-32 h-32 bg-blue-900/20 rounded-full flex items-center justify-center border border-blue-500 relative">
                                   <Smartphone className="w-16 h-16 text-blue-400 z-10" />
                                   {p2pStatus === 'connected' && <div className="absolute inset-0 rounded-full animate-ping border border-blue-500 opacity-20"></div>}
                               </div>
                               <div className="text-center">
                                   <h5 className="text-xl font-bold text-white">CONNECTED TO HOST</h5>
                                   <p className="text-blue-400 font-mono mt-1">Latency: Low</p>
                               </div>
                               <button onClick={disconnectP2P} className="px-6 py-2 border border-red-500/50 text-red-400 hover:bg-red-900/20 rounded">
                                   DISCONNECT REMOTE
                               </button>
                           </div>
                       )}
                   </div>
               )}
            </div>

            {/* Close Button Mobile */}
            <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-4 right-4 md:hidden p-2 bg-gray-800 rounded-full text-gray-400"
            >
                <EyeOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;