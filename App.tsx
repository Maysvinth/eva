import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Mic, MicOff, Settings, Terminal, Activity, Zap, Cloud, Key, Smartphone, Monitor, EyeOff, QrCode, Wifi, Laptop, Volume2, Power, ArrowRight, Play, Pause, SkipForward, SkipBack, Octagon } from 'lucide-react';
import AvatarVisualizer from './components/AvatarVisualizer';
import { ChatHistory } from './components/ChatHistory';
import { useGeminiLive } from './hooks/useGeminiLive';
import { useDevicePairing } from './hooks/useDevicePairing';
import { CHARACTERS, VOICE_LIBRARY } from './constants';
import { CharacterProfile, VoiceName } from './types';

const App: React.FC = () => {
  // Initialize state from localStorage with voice override support
  const [activeCharacter, setActiveCharacter] = useState<CharacterProfile>(() => {
    const savedId = localStorage.getItem('eva_active_character_id');
    const overrides = JSON.parse(localStorage.getItem('eva_voice_overrides') || '{}');
    
    let found = CHARACTERS.find(c => c.id === savedId) || CHARACTERS[0];
    
    if (overrides[found.id]) {
        const voiceName = overrides[found.id] as VoiceName;
        const voiceData = VOICE_LIBRARY.find(v => v.name === voiceName);
        if (voiceData) {
            found = { 
                ...found, 
                voiceName: voiceName,
                themeColor: voiceData.themeColor,
                visualizerColor: voiceData.hexColor
            };
        }
    }
    return found;
  });

  // Character Reordering State (LRU)
  const [characterOrder, setCharacterOrder] = useState<string[]>(() => {
      const savedOrder = localStorage.getItem('eva_character_order');
      const allIds = CHARACTERS.map(c => c.id);
      if (savedOrder) {
          const parsed = JSON.parse(savedOrder);
          // Merge ensuring no duplicates and including any new IDs added to constants
          return [...new Set([...parsed, ...allIds])];
      }
      return allIds;
  });

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'device_link' | 'voice'>('general');
  const [targetCodeInput, setTargetCodeInput] = useState('');
  const [isMediaPlaying, setIsMediaPlaying] = useState(false);
  
  // Customization
  const [wakeWord, setWakeWord] = useState<string>(() => {
      return localStorage.getItem('eva_wake_word') || '';
  });

  const [stopWord, setStopWord] = useState<string>(() => {
      return localStorage.getItem('eva_stop_word') || 'Stop';
  });

  // Always On State
  const [alwaysOn, setAlwaysOn] = useState<boolean>(() => {
      return localStorage.getItem('eva_always_on') === 'true';
  });

  // P2P Hook
  const { 
    role, 
    pairingCode, 
    connectionStatus: p2pStatus, 
    initializeHost, 
    connectToHost, 
    sendCommand,
    disconnectP2P
  } = useDevicePairing();

  const volumeRef = useRef<number>(0);

  // Check for API Key on mount
  useEffect(() => {
    if (!process.env.API_KEY) {
      setApiKeyMissing(true);
    }
  }, []);

  // Persist settings
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

  const { connect, disconnect, connectionState, messages, streamingUserText, streamingModelText, error } = useGeminiLive({
    character: activeCharacter,
    onVisualizerUpdate: (vol) => { volumeRef.current = vol; },
    isRemoteMode: role === 'remote',
    sendRemoteCommand: sendCommand,
    autoReconnect: alwaysOn,
    wakeWord: wakeWord,
    stopWord: stopWord,
    onMediaCommand: (cmd) => {
        // Sync UI state with Voice Command
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
  
  const toggleAlwaysOn = () => {
      setAlwaysOn(prev => !prev);
  };

  const switchCharacter = (char: CharacterProfile) => {
      const overrides = JSON.parse(localStorage.getItem('eva_voice_overrides') || '{}');
      const savedVoiceName = overrides[char.id];
      let newCharState = char;
      
      if (savedVoiceName) {
         const voiceData = VOICE_LIBRARY.find(v => v.name === savedVoiceName);
         if (voiceData) {
            newCharState = { 
                 ...char, 
                 voiceName: savedVoiceName,
                 themeColor: voiceData.themeColor,
                 visualizerColor: voiceData.hexColor
             };
         }
      }
      setActiveCharacter(newCharState);
      setCharacterOrder(prev => {
          const newOrder = [char.id, ...prev.filter(id => id !== char.id)];
          return newOrder;
      });
  };

  const handleVoiceSelection = (voiceName: VoiceName) => {
     const signatureCharacter = CHARACTERS.find(c => c.voiceName === voiceName);
     const voiceData = VOICE_LIBRARY.find(v => v.name === voiceName);

     if (signatureCharacter) {
        switchCharacter(signatureCharacter);
     } else if (voiceData) {
        setActiveCharacter(prev => ({ 
            ...prev, 
            voiceName: voiceName,
            themeColor: voiceData.themeColor,
            visualizerColor: voiceData.hexColor
        }));
     }
  };

  const orderedCharacters = useMemo(() => {
      return characterOrder
        .map(id => CHARACTERS.find(c => c.id === id))
        .filter((c): c is CharacterProfile => !!c);
  }, [characterOrder]);

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

  // UI Layout Logic
  // If Remote (Phone connected to Host), force full width left panel, hide right panel.
  // Standard mobile (< md) also hides right panel via hidden md:flex.
  const isRemote = role === 'remote';

  return (
    <div className="h-[100dvh] bg-[#050505] text-white flex flex-col font-sans selection:bg-cyan-500/30 overflow-hidden">
      
      {/* Header */}
      <header className="h-16 border-b border-gray-900 flex items-center justify-between px-6 bg-black/50 backdrop-blur-md fixed w-full z-50 top-0">
        <div className="flex items-center space-x-2">
          <Activity className={`w-5 h-5 ${connectionState === 'connected' ? 'text-green-500 animate-pulse' : 'text-gray-600'}`} />
          <h1 className="text-xl font-display tracking-widest font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-500">
            PROJECT <span className={`text-${activeCharacter.themeColor}-500 transition-colors duration-500`}>EVA</span>
          </h1>
          {role === 'remote' && p2pStatus === 'connected' && (
             <span className="ml-2 px-2 py-0.5 rounded bg-blue-900/50 border border-blue-500/30 text-[10px] text-blue-300 font-mono flex items-center">
                <Wifi className="w-3 h-3 mr-1" /> LINKED
             </span>
          )}
          {role === 'host' && (
             <span className="ml-2 px-2 py-0.5 rounded bg-purple-900/50 border border-purple-500/30 text-[10px] text-purple-300 font-mono flex items-center">
                <Monitor className="w-3 h-3 mr-1" /> HOST
             </span>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
           {/* Character Selector - Scrollable on mobile */}
           <div className="flex bg-gray-900/80 rounded-full p-1 border border-gray-800 backdrop-blur-sm max-w-[150px] md:max-w-none overflow-x-auto no-scrollbar">
             {orderedCharacters.map((char) => (
               <button
                 key={char.id}
                 onClick={() => switchCharacter(char)}
                 className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center space-x-2 whitespace-nowrap ${
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
        
        {/* Left Panel: Visualizer & Controls */}
        {/* If isRemote, occupy w-full. Else, standard responsive width. */}
        <div className={`flex flex-col border-r border-gray-900 relative bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] 
            ${isRemote ? 'w-full' : 'w-full md:w-1/2 lg:w-2/5'}
        `}>
           <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black pointer-events-none opacity-80" />
           
           {/* Visualizer Container */}
           <div className="flex-1 flex items-center justify-center relative z-10">
              <div className="w-[300px] h-[300px] md:w-[400px] md:h-[400px] relative">
                 {/* Decorative HUD Elements */}
                 <div className={`absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-${activeCharacter.themeColor}-500/30 transition-colors duration-500`} />
                 <div className={`absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-${activeCharacter.themeColor}-500/30 transition-colors duration-500`} />
                 <div className={`absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-${activeCharacter.themeColor}-500/30 transition-colors duration-500`} />
                 <div className={`absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-${activeCharacter.themeColor}-500/30 transition-colors duration-500`} />
                 
                 {/* Voice Tag HUD */}
                 <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 text-[10px] font-mono tracking-widest bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-${activeCharacter.themeColor}-500/30 shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all duration-500 flex items-center space-x-2`}>
                    <span className="text-gray-500">VOICE MODULE</span>
                    <div className={`w-1 h-1 bg-${activeCharacter.themeColor}-500 rounded-full animate-pulse`} />
                    <span 
                        className={`font-bold transition-colors duration-500 text-${activeCharacter.themeColor}-400 drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]`}
                        style={{ color: activeCharacter.visualizerColor }}
                    >
                        {activeCharacter.voiceName.toUpperCase()}
                    </span>
                 </div>

                 <AvatarVisualizer 
                   volumeRef={volumeRef} 
                   color={activeCharacter.visualizerColor}
                   isActive={connectionState === 'connected'}
                 />
              </div>
           </div>

           {/* Controls */}
           <div className="p-8 flex flex-col items-center justify-center space-y-4 z-20 pb-20 md:pb-8">
              <div className="text-center mb-4">
                 <h2 className={`text-2xl font-display font-bold text-${activeCharacter.themeColor}-500 tracking-wider transition-colors duration-500`}>
                   {activeCharacter.name}
                 </h2>
                 <p className="text-gray-500 text-sm font-mono mt-1">
                   STATUS: <span className={connectionState === 'connected' ? 'text-green-500' : 'text-red-500'}>{connectionState.toUpperCase()}</span>
                 </p>
                 {wakeWord && (
                     <p className="text-[10px] text-gray-600 font-mono mt-1 uppercase tracking-widest">
                         Wake Word: <span className="text-white">{wakeWord}</span>
                     </p>
                 )}
              </div>

              {/* Main Mic & Always On */}
              <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={handleToggleConnection}
                    disabled={apiKeyMissing}
                    className={`
                      group relative flex items-center justify-center w-20 h-20 rounded-full border-2 transition-all duration-300
                      ${connectionState === 'connected' 
                        ? `border-${activeCharacter.themeColor}-500/50 bg-${activeCharacter.themeColor}-900/10 hover:bg-${activeCharacter.themeColor}-900/30` 
                        : `border-${activeCharacter.themeColor}-500/50 bg-${activeCharacter.themeColor}-900/10 hover:bg-${activeCharacter.themeColor}-900/30`}
                      ${apiKeyMissing ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                     {connectionState === 'connected' ? (
                        <MicOff className={`w-8 h-8 text-${activeCharacter.themeColor}-400`} />
                     ) : (
                        <Mic className={`w-8 h-8 text-${activeCharacter.themeColor}-400 group-hover:scale-110 transition-transform`} />
                     )}
                     {/* Ripple Effect */}
                     {connectionState === 'connected' && (
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
                        w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 relative group
                        border-${activeCharacter.themeColor}-500/30 hover:border-${activeCharacter.themeColor}-500
                        ${streamingModelText ? 'animate-spin-slow' : ''}
                     `}
                   >
                      {isMediaPlaying ? (
                          <Pause className={`w-5 h-5 text-${activeCharacter.themeColor}-400`} />
                      ) : (
                          <Play className={`w-5 h-5 text-${activeCharacter.themeColor}-400 ml-1`} />
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
        {/* Force hidden if Remote. Otherwise standard responsive logic. */}
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
            
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-950">
               <h3 className="text-xl font-display font-bold text-white flex items-center">
                 <Settings className="w-5 h-5 mr-2 text-cyan-500" /> 
                 SYSTEM CONFIG
               </h3>
               <div className="flex space-x-2">
                 <button 
                   onClick={() => setShowSettings(false)}
                   className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400 transition-colors flex items-center"
                 >
                   <EyeOff className="w-3 h-3 mr-1" /> HIDE MENU
                 </button>
               </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800">
               <button 
                 onClick={() => setSettingsTab('general')}
                 className={`flex-1 py-3 text-sm font-medium transition-colors ${settingsTab === 'general' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
               >
                 GENERAL
               </button>
               <button 
                 onClick={() => setSettingsTab('device_link')}
                 className={`flex-1 py-3 text-sm font-medium transition-colors ${settingsTab === 'device_link' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
               >
                 DEVICE LINK
               </button>
               <button 
                 onClick={() => setSettingsTab('voice')}
                 className={`flex-1 py-3 text-sm font-medium transition-colors ${settingsTab === 'voice' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
               >
                 VOICE SYNTHESIS
               </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 space-y-4 text-sm text-gray-400 max-h-[60vh] overflow-y-auto">
               
               {settingsTab === 'general' && (
                 <>
                   <div className="p-4 bg-black/50 rounded border border-gray-800">
                     <h4 className="text-gray-200 font-bold mb-2 flex items-center"><Key className="w-4 h-4 mr-2"/> API Access</h4>
                     <p>This application uses the <strong>Gemini Multimodal Live API</strong>. The API Key is injected via environment variables.</p>
                   </div>
                   
                   <div className="p-4 bg-black/50 rounded border border-gray-800">
                     <h4 className="text-gray-200 font-bold mb-2 flex items-center"><Zap className="w-4 h-4 mr-2"/> Rapid Activation (Wake Word)</h4>
                     <p className="mb-3">Set a custom wake word to trigger the AI hands-free when connected.</p>
                     <div className="flex gap-2">
                         <input 
                            type="text" 
                            value={wakeWord}
                            onChange={(e) => setWakeWord(e.target.value)}
                            placeholder="e.g., Computer, Eva, Hey System..."
                            className="bg-gray-900 border border-gray-700 rounded px-3 py-2 flex-1 text-white focus:border-cyan-500 outline-none"
                         />
                     </div>
                     <p className="text-[10px] mt-2 text-gray-500">Note: Leave empty to disable wake word detection (AI responds to everything).</p>
                   </div>

                   <div className="p-4 bg-black/50 rounded border border-gray-800">
                     <h4 className="text-gray-200 font-bold mb-2 flex items-center"><Octagon className="w-4 h-4 mr-2 text-red-500"/> Emergency Stop Word</h4>
                     <p className="mb-3">Define a word that instantly silences the AI (Client-side Kill Switch).</p>
                     <input 
                        type="text" 
                        value={stopWord}
                        onChange={(e) => setStopWord(e.target.value)}
                        placeholder="e.g., Stop, Silence, Halt, Enough..."
                        className="bg-gray-900 border border-gray-700 rounded px-3 py-2 w-full text-white focus:border-red-500 outline-none"
                     />
                   </div>

                   <div className="p-4 bg-black/50 rounded border border-gray-800">
                     <h4 className="text-gray-200 font-bold mb-2">Instructions</h4>
                     <ol className="list-decimal list-inside mt-2 space-y-1 ml-2">
                       <li>Select a personality from the top bar.</li>
                       <li>Click the central microphone button.</li>
                       <li>Speak naturally to the AI.</li>
                     </ol>
                   </div>
                 </>
               )}

               {settingsTab === 'device_link' && (
                 <div className="space-y-6">
                    {/* Role Selection */}
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => { disconnectP2P(); initializeHost(); }}
                        className={`p-4 rounded border flex flex-col items-center justify-center transition-all ${role === 'host' ? 'bg-purple-900/30 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                      >
                         <Monitor className="w-8 h-8 mb-2" />
                         <span className="font-bold">I am the LAPTOP</span>
                         <span className="text-[10px] opacity-70">Target Device</span>
                      </button>

                      <button 
                        onClick={() => { disconnectP2P(); setTargetCodeInput(''); }} 
                        className={`p-4 rounded border flex flex-col items-center justify-center transition-all ${role === 'remote' ? 'bg-blue-900/30 border-blue-500 text-blue-300' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                      >
                         <Smartphone className="w-8 h-8 mb-2" />
                         <span className="font-bold">I am the PHONE</span>
                         <span className="text-[10px] opacity-70">Controller</span>
                      </button>
                    </div>

                    {/* Host UI */}
                    {role === 'host' && (
                        <div className="p-6 bg-black/50 border border-purple-500/30 rounded-lg flex flex-col items-center text-center">
                            <h4 className="text-purple-400 font-bold mb-4">WAITING FOR CONNECTION</h4>
                            {pairingCode ? (
                                <>
                                    <div className="text-4xl font-mono font-bold tracking-[0.5em] text-white bg-gray-900 px-6 py-4 rounded mb-2">
                                        {pairingCode}
                                    </div>
                                    <p className="text-xs text-gray-500">Enter this code on your mobile device</p>
                                    
                                    <div className="mt-6 flex items-center space-x-2">
                                        <div className={`w-3 h-3 rounded-full ${p2pStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                        <span className="text-xs font-mono uppercase">
                                            {p2pStatus === 'connected' ? 'DEVICE LINKED' : 'DISCONNECTED'}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <div className="text-sm animate-pulse">Generating Secure ID...</div>
                            )}
                        </div>
                    )}

                    {/* Remote UI */}
                    {role !== 'host' && (
                        <div className="p-6 bg-black/50 border border-blue-500/30 rounded-lg">
                             <h4 className="text-blue-400 font-bold mb-4 flex items-center">
                                <Laptop className="w-4 h-4 mr-2" /> FIND AVAILABLE DEVICE
                             </h4>
                             
                             {p2pStatus === 'connected' ? (
                                 <div className="text-center py-4">
                                     <div className="text-green-400 font-bold text-lg mb-2">CONNECTED TO HOST</div>
                                     <button 
                                        onClick={disconnectP2P}
                                        className="text-xs text-red-400 hover:underline"
                                     >
                                        Disconnect
                                     </button>
                                 </div>
                             ) : (
                                 <div className="flex flex-col space-y-4">
                                     <p className="text-xs text-gray-400">Enter the 4-character code displayed on the laptop screen.</p>
                                     <div className="flex space-x-2">
                                         <input 
                                            type="text" 
                                            maxLength={4}
                                            value={targetCodeInput}
                                            onChange={(e) => setTargetCodeInput(e.target.value.toUpperCase())}
                                            placeholder="XXXX"
                                            className="flex-1 bg-gray-900 border border-gray-700 rounded px-4 py-2 text-center font-mono text-xl tracking-widest focus:border-blue-500 outline-none"
                                         />
                                         <button 
                                            onClick={() => connectToHost(targetCodeInput)}
                                            disabled={targetCodeInput.length !== 4}
                                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 rounded font-bold"
                                         >
                                            LINK
                                         </button>
                                     </div>
                                 </div>
                             )}
                        </div>
                    )}

                 </div>
               )}

               {settingsTab === 'voice' && (
                 <div className="space-y-4">
                   <p className="text-xs text-gray-500 mb-4 bg-gray-800 p-2 rounded text-center border border-gray-700">
                      <span className="font-bold text-cyan-400">DOUBLE CLICK</span> or <span className="font-bold text-cyan-400">DOUBLE TAP</span> a voice to activate it.
                   </p>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {/* Male Voices */}
                     <div>
                       <h4 className="text-blue-400 font-mono text-xs uppercase mb-3 border-b border-blue-900/50 pb-1">Masculine Frequency</h4>
                       <div className="space-y-2">
                         {VOICE_LIBRARY.filter(v => v.gender === 'Male').map(voice => (
                           <div
                             key={voice.name}
                             onDoubleClick={() => handleVoiceSelection(voice.name)}
                             className={`w-full text-left p-3 rounded flex items-center justify-between border transition-all cursor-pointer select-none ${
                               activeCharacter.voiceName === voice.name
                                 ? `bg-${voice.themeColor}-900/20 border-${voice.themeColor}-500 text-white`
                                 : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800 active:bg-gray-700'
                             }`}
                           >
                              <div>
                                <div className="font-bold" style={{ color: activeCharacter.voiceName === voice.name ? voice.hexColor : undefined }}>
                                    {voice.name}
                                </div>
                                <div className="text-[10px] opacity-70">{voice.description}</div>
                              </div>
                              {activeCharacter.voiceName === voice.name && (
                                <div 
                                    className="w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_currentColor]"
                                    style={{ backgroundColor: voice.hexColor, color: voice.hexColor }}
                                />
                              )}
                           </div>
                         ))}
                       </div>
                     </div>

                     {/* Female Voices */}
                     <div>
                       <h4 className="text-pink-400 font-mono text-xs uppercase mb-3 border-b border-pink-900/50 pb-1">Feminine Frequency</h4>
                       <div className="space-y-2">
                         {VOICE_LIBRARY.filter(v => v.gender === 'Female').map(voice => (
                           <div
                             key={voice.name}
                             onDoubleClick={() => handleVoiceSelection(voice.name)}
                             className={`w-full text-left p-3 rounded flex items-center justify-between border transition-all cursor-pointer select-none ${
                               activeCharacter.voiceName === voice.name
                                 ? `bg-${voice.themeColor}-900/20 border-${voice.themeColor}-500 text-white`
                                 : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800 active:bg-gray-700'
                             }`}
                           >
                              <div>
                                <div className="font-bold" style={{ color: activeCharacter.voiceName === voice.name ? voice.hexColor : undefined }}>
                                    {voice.name}
                                </div>
                                <div className="text-[10px] opacity-70">{voice.description}</div>
                              </div>
                              {activeCharacter.voiceName === voice.name && (
                                <div 
                                    className="w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_currentColor]"
                                    style={{ backgroundColor: voice.hexColor, color: voice.hexColor }}
                                />
                              )}
                           </div>
                         ))}
                       </div>
                     </div>
                   </div>
                 </div>
               )}

            </div>
          </div>
        </div>
      )}

      {/* API Key Missing Overlay */}
      {apiKeyMissing && (
         <div className="fixed bottom-0 left-0 right-0 bg-red-900/90 text-white p-4 text-center z-[100] font-bold">
           CRITICAL: API_KEY NOT DETECTED. SYSTEM HALTED.
         </div>
      )}
    </div>
  );
};

export default App;