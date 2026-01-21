import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { pcmToGeminiBlob, base64ToUint8Array, decodeAudioData, downsampleTo16k, hasSpeech } from '../utils/audio';
import { CharacterProfile, ConnectionState, Message } from '../types';

// Supported Voices Map
const SAFE_VOICE_MAP: Record<string, string> = {
  'Puck': 'Puck', 'Charon': 'Charon', 'Fenrir': 'Fenrir', 'Lynx': 'Fenrir', 'Orion': 'Charon',
  'Kael': 'Fenrir', 'Ryu': 'Puck', 'Atlas': 'Charon', 'Neo': 'Puck', 'Dante': 'Fenrir',
  'Kore': 'Kore', 'Zephyr': 'Zephyr', 'Aoede': 'Zephyr', 'Leda': 'Kore', 'Vega': 'Zephyr',
  'Luna': 'Zephyr', 'Solaris': 'Kore', 'Nova': 'Zephyr', 'Aria': 'Zephyr', 'Viper': 'Kore',
};

const timeTool: FunctionDeclaration = {
  name: 'getCurrentTime',
  description: 'Get local time.',
  parameters: { type: Type.OBJECT, properties: {} },
};

const mediaControlTool: FunctionDeclaration = {
  name: 'controlMedia',
  description: 'Control media playback (play, pause, next track, previous track, seek).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      command: { 
        type: Type.STRING, 
        enum: ['play', 'pause', 'next', 'previous', 'stop', 'seek_forward', 'seek_backward'] 
      }
    },
    required: ['command']
  }
};

const laptopControlTool: FunctionDeclaration = {
  name: 'executeRemoteAction',
  description: 'Execute PC action: open_app, open_url, play_music, play_video.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        enum: ['open_url', 'play_music', 'play_video', 'open_app']
      },
      query: { type: Type.STRING }
    },
    required: ['action', 'query']
  }
};

const communicationTool: FunctionDeclaration = {
    name: 'checkMessages',
    description: 'Check for messages from a specific person on a platform (WhatsApp, Discord, etc).',
    parameters: {
        type: Type.OBJECT,
        properties: {
            platform: { type: Type.STRING, description: 'App name e.g., WhatsApp, Discord, Slack' },
            sender: { type: Type.STRING, description: 'Name of the person' }
        },
        required: ['platform']
    }
};

interface UseGeminiLiveProps {
  character: CharacterProfile;
  onVisualizerUpdate: (volume: number) => void;
  isRemoteMode: boolean; 
  sendRemoteCommand: (action: 'open_url' | 'play_music' | 'play_video' | 'open_app' | 'media_control', query: string) => boolean;
  autoReconnect: boolean;
  wakeWord?: string;
  stopWord?: string;
  onMediaCommand?: (command: string) => void;
}

export const useGeminiLive = ({ character, onVisualizerUpdate, isRemoteMode, sendRemoteCommand, autoReconnect, wakeWord, stopWord, onMediaCommand }: UseGeminiLiveProps) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingUserText, setStreamingUserText] = useState<string>("");
  const [streamingModelText, setStreamingModelText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  
  // Standby State (Muted but listening for wake word)
  const [isStandby, setIsStandby] = useState(false);

  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const currentSessionRef = useRef<any>(null);
  
  const activeConnectionParamsRef = useRef<{ id: string, voiceName: string, wakeWord?: string, stopWord?: string } | null>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const isConnectedRef = useRef<boolean>(false);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const autoReconnectTimerRef = useRef<any>(null);
  const lastSpeechTimeRef = useRef<number>(Date.now());
  const standbyCheckIntervalRef = useRef<any>(null);

  const stopAllAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
  }, []);

  // Enter Standby Mode (Muted)
  const enterStandby = useCallback(() => {
    console.log("Entering Standby Mode");
    setIsStandby(true);
    stopAllAudio();
  }, [stopAllAudio]);

  const exitStandby = useCallback(() => {
    console.log("Wake Word Detected - Exiting Standby");
    setIsStandby(false);
    lastSpeechTimeRef.current = Date.now();
  }, []);

  const disconnect = useCallback(async () => {
    isConnectedRef.current = false;
    
    if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);
    if (standbyCheckIntervalRef.current) clearInterval(standbyCheckIntervalRef.current);

    if (currentSessionRef.current) {
        try { currentSessionRef.current.close(); } catch (e) {}
        currentSessionRef.current = null;
    }

    stopAllAudio();
    activeConnectionParamsRef.current = null;
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (processorNodeRef.current) {
      try { processorNodeRef.current.disconnect(); } catch(e) {}
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch(e) {}
      sourceNodeRef.current = null;
    }
    
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
      try { await inputContextRef.current.close(); } catch(e) {}
      inputContextRef.current = null;
    }
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') {
      try { await outputContextRef.current.close(); } catch(e) {}
      outputContextRef.current = null;
    }
    
    setConnectionState('disconnected');
    setIsStandby(false);
    nextStartTimeRef.current = 0;
    setStreamingUserText("");
    setStreamingModelText("");
  }, [stopAllAudio]);

  const connect = useCallback(async () => {
    if (isConnectedRef.current || connectionState === 'connecting') return;
    if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);

    setConnectionState('connecting');
    setError(null);
    activeConnectionParamsRef.current = { id: character.id, voiceName: character.voiceName, wakeWord: wakeWord, stopWord: stopWord };

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000
        }});
        streamRef.current = stream;

        const audioCtxInput = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const audioCtxOutput = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        if (audioCtxInput.state === 'suspended') await audioCtxInput.resume();
        if (audioCtxOutput.state === 'suspended') await audioCtxOutput.resume();

        inputContextRef.current = audioCtxInput;
        outputContextRef.current = audioCtxOutput;

        // Protocol Instructions
        const wakeProto = wakeWord ? `\n\nPROTOCOL: WAKE_WORD_DETECTION
        The user has a custom Wake Word: "${wakeWord}".
        If you are silent, listen specifically for this phrase.
        If the user says "${wakeWord}", respond with "Yes?" or a greeting.` : "";

        const stopProto = stopWord ? `\n\nPROTOCOL: EMERGENCY_STOP
        If the user says "${stopWord}", STOP speaking immediately.
        If the user says "Thank you", reply politely then stop speaking.` : "";

        const baseInstruction = isRemoteMode 
          ? `You are a REMOTE CONTROLLER. Answer FAST and CONCISELY. Use 'executeRemoteAction' for PC tasks. Use 'checkMessages' to open messaging apps.`
          : `You are a helpful AI Assistant. Answer FAST and CONCISELY. Use 'executeRemoteAction' for PC tasks. Use 'checkMessages' to open messaging apps.`;
        
        const finalSystemInstruction = `${baseInstruction} Voice: ${character.voiceName}. ${character.systemInstruction}${wakeProto}${stopProto}`;
        const safeVoice = SAFE_VOICE_MAP[character.voiceName] || 'Puck';

        const config = {
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } } },
            systemInstruction: finalSystemInstruction,
            inputAudioTranscription: {}, 
            outputAudioTranscription: {},
            tools: [{ functionDeclarations: [timeTool, laptopControlTool, mediaControlTool, communicationTool] }]
          }
        };

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const session = await ai.live.connect({
            model: config.model,
            config: config.config,
            callbacks: {
                onopen: () => {
                    setConnectionState('connected');
                    isConnectedRef.current = true;
                    lastSpeechTimeRef.current = Date.now();
                    nextStartTimeRef.current = audioCtxOutput.currentTime;
                    
                    const source = audioCtxInput.createMediaStreamSource(stream);
                    const processor = audioCtxInput.createScriptProcessor(512, 1, 1);
                    
                    sourceNodeRef.current = source;
                    processorNodeRef.current = processor;

                    // 1-Minute Auto-Standby Timer
                    standbyCheckIntervalRef.current = setInterval(() => {
                        const timeSinceSpeech = Date.now() - lastSpeechTimeRef.current;
                        if (timeSinceSpeech > 60000 && isConnectedRef.current) { // 60 seconds
                            setIsStandby(prev => {
                                if (!prev) {
                                    console.log("Auto-Standby: 60s Silence Detected");
                                    return true;
                                }
                                return prev;
                            });
                        }
                    }, 5000);

                    processor.onaudioprocess = (e) => {
                      if (!isConnectedRef.current || !currentSessionRef.current) return;

                      const inputData = e.inputBuffer.getChannelData(0);
                      
                      // NOISE GATE: Ignore silence / background hiss
                      // Threshold 0.02 filters out fans/breathing but catches speech
                      if (!hasSpeech(inputData, 0.02)) {
                          onVisualizerUpdate(0); // Zero out visualizer
                          return; 
                      }

                      // If we are in standby, we update lastSpeechTime only if wake word is detected?
                      // No, we rely on transcript. But we reset timer on any loud noise to prevent premature sleep if actively talking.
                      if (hasSpeech(inputData, 0.05)) {
                          lastSpeechTimeRef.current = Date.now();
                      }

                      let sum = 0;
                      for(let i=0; i<inputData.length; i+=20) sum += Math.abs(inputData[i]); 
                      onVisualizerUpdate((sum / (inputData.length/20)) * 3); 

                      const downsampledData = downsampleTo16k(inputData, audioCtxInput.sampleRate);
                      const blob = pcmToGeminiBlob(downsampledData, 16000);
                      
                      try {
                         currentSessionRef.current.sendRealtimeInput({ media: blob });
                      } catch (err) {
                         if (String(err).includes("CLOSING") || String(err).includes("CLOSED")) {
                             isConnectedRef.current = false;
                         }
                      }
                    };

                    source.connect(processor);
                    processor.connect(audioCtxInput.destination);
                },
                onmessage: async (msg: LiveServerMessage) => {
                    const { serverContent } = msg;

                    if (serverContent?.interrupted) {
                        stopAllAudio();
                        if (outputContextRef.current) nextStartTimeRef.current = outputContextRef.current.currentTime;
                        return; 
                    }

                    // --- INPUT PROCESSING (User) ---
                    if (serverContent?.inputTranscription?.text) {
                      const text = serverContent.inputTranscription.text;
                      setStreamingUserText(prev => prev + text);
                      
                      // Wake Word Logic
                      if (wakeWord && text.toLowerCase().includes(wakeWord.toLowerCase())) {
                          exitStandby();
                      }

                      // Standby Triggers (Thank you / Stop Word)
                      if ((stopWord && text.toLowerCase().includes(stopWord.toLowerCase())) || text.toLowerCase().includes("thank you")) {
                          enterStandby();
                      }
                    }

                    // --- OUTPUT PROCESSING (Model) ---
                    // If in Standby, IGNORE model audio output
                    if (isStandby) {
                        // We still process text for logs, but we do NOT play audio
                        // UNLESS the model says something indicating it woke up (rare if prompt is good)
                        // For safety, we just drop audio packets in standby.
                    } else {
                        // Play Audio
                        const audioData = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audioData && outputContextRef.current) {
                           const audioBuffer = await decodeAudioData(base64ToUint8Array(audioData), outputContextRef.current, 24000);
                           const source = outputContextRef.current.createBufferSource();
                           const analyser = outputContextRef.current.createAnalyser();
                           analyser.fftSize = 64; 
                           source.buffer = audioBuffer;
                           source.connect(analyser);
                           analyser.connect(outputContextRef.current.destination);
                           
                           activeSourcesRef.current.push(source);
                           source.onended = () => {
                               activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                           };

                           // Output Visualizer
                           const bufferLength = analyser.frequencyBinCount;
                           const dataArray = new Uint8Array(bufferLength);
                           const updateVisualizer = () => {
                             if (!isConnectedRef.current) return;
                             analyser.getByteFrequencyData(dataArray);
                             let sum = 0;
                             for (let i=0; i<bufferLength; i++) sum += dataArray[i];
                             onVisualizerUpdate((sum / bufferLength) / 255); 
                             requestAnimationFrame(updateVisualizer);
                           };
                           requestAnimationFrame(updateVisualizer);

                           const currentTime = outputContextRef.current.currentTime;
                           if (nextStartTimeRef.current < currentTime) nextStartTimeRef.current = currentTime;
                           source.start(nextStartTimeRef.current);
                           nextStartTimeRef.current += audioBuffer.duration;
                        }
                    }
                    
                    // --- TOOLS ---
                    if (msg.toolCall && msg.toolCall.functionCalls) {
                        for (const fc of msg.toolCall.functionCalls) {
                            let result: any = { status: 'ok' };
                            
                            if (fc.name === 'checkMessages') {
                                const args = fc.args as any;
                                const platform = args.platform || 'whatsapp';
                                const sender = args.sender ? ` from ${args.sender}` : '';
                                
                                if (isRemoteMode) {
                                    sendRemoteCommand('open_app', platform);
                                    result = { status: 'opened', details: `Opened ${platform} on remote host` };
                                } else {
                                    // Trigger Open App Logic via map in DevicePairing or direct window location if possible
                                    // Here we just replicate the open_app logic locally for "standalone"
                                    // We can't import the map here easily, so we use a simple dispatch or helper? 
                                    // Actually, we can reuse executeRemoteAction logic right below
                                    
                                    // Construct URI
                                    let uri = '';
                                    const p = platform.toLowerCase();
                                    if (p.includes('whatsapp')) uri = 'whatsapp://';
                                    else if (p.includes('discord')) uri = 'discord://';
                                    else if (p.includes('slack')) uri = 'slack://';
                                    else if (p.includes('telegram')) uri = 'tg://';
                                    else uri = 'https://www.google.com/search?q=' + platform;

                                    if (uri.startsWith('http')) window.open(uri, '_blank');
                                    else window.location.assign(uri);
                                    
                                    result = { status: 'opened', message: `I have opened ${platform}${sender}. I cannot read messages directly due to privacy, but they are on screen now.` };
                                }
                            }
                            else if (fc.name === 'controlMedia') {
                                const args = fc.args as any;
                                if (args.command === 'pause' || args.command === 'stop') stopAllAudio();
                                if (onMediaCommand) onMediaCommand(args.command);
                                
                                if (isRemoteMode) {
                                    sendRemoteCommand('media_control', args.command);
                                } else {
                                     let key = 'MediaPlayPause';
                                     if (args.command === 'next') key = 'MediaTrackNext';
                                     if (args.command === 'previous') key = 'MediaTrackPrevious';
                                     if (args.command === 'stop') key = 'MediaStop';
                                     if (args.command === 'seek_forward') key = 'ArrowRight'; 
                                     if (args.command === 'seek_backward') key = 'ArrowLeft'; 
                                     try { document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true })); } catch(e) {}
                                }
                            } 
                            else if (fc.name === 'executeRemoteAction') {
                                const args = fc.args as any;
                                if (isRemoteMode) {
                                    sendRemoteCommand(args.action, args.query);
                                } else {
                                    // Direct action if not remote
                                    setTimeout(() => {
                                        if (args.action === 'open_url') window.open(args.query.startsWith('http') ? args.query : 'https://'+args.query, '_blank');
                                        else if (args.action === 'play_music') window.location.assign(`spotify:search:${encodeURIComponent(args.query)}`);
                                        else if (args.action === 'play_video') window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`, '_blank');
                                        else if (args.action === 'open_app') {
                                             // Basic fallback for standalone if pairing hook map isn't available
                                             const q = args.query.toLowerCase();
                                             if (q.includes('whatsapp')) window.location.assign('whatsapp://');
                                             else if (q.includes('discord')) window.location.assign('discord://');
                                             else if (q.includes('calculator')) window.location.assign('calculator:');
                                             else window.open(`https://www.google.com/search?q=${encodeURIComponent(args.query)}`, '_blank');
                                        }
                                    }, 50);
                                }
                            } 
                            session.sendToolResponse({
                                functionResponses: { id: fc.id, name: fc.name, response: result }
                            });
                        }
                    }
                },
                onclose: () => {
                    setConnectionState('disconnected');
                    isConnectedRef.current = false;
                    currentSessionRef.current = null;
                    setIsStandby(false);
                    if (autoReconnect && !error?.includes("Permission") && !isReconnectingRef.current) {
                        autoReconnectTimerRef.current = setTimeout(() => connect(), 2000);
                    }
                },
                onerror: (err: any) => {
                    const msg = String(err);
                    if (!msg.includes("Network error")) {
                        setError(msg);
                        setConnectionState('error');
                    }
                    isConnectedRef.current = false;
                }
            }
        });
        
        currentSessionRef.current = session;

    } catch (e: any) {
        setError(e.message);
        setConnectionState('error');
    }
  }, [character, onVisualizerUpdate, stopAllAudio, isRemoteMode, sendRemoteCommand, autoReconnect, wakeWord, onMediaCommand, stopWord, connectionState, enterStandby, exitStandby, isStandby]); 

  // Detect character changes
  useEffect(() => {
    if (connectionState === 'connected' && activeConnectionParamsRef.current && !isReconnectingRef.current) {
        const active = activeConnectionParamsRef.current;
        if (active.id !== character.id || active.voiceName !== character.voiceName || active.wakeWord !== wakeWord || active.stopWord !== stopWord) {
            isReconnectingRef.current = true;
            disconnect().then(() => {
                setTimeout(() => {
                    connect().finally(() => { isReconnectingRef.current = false; });
                }, 200); 
            });
        }
    }
  }, [character, connect, disconnect, connectionState, wakeWord, stopWord]);

  return { connect, disconnect, connectionState, messages, streamingUserText, streamingModelText, error, isStandby };
};