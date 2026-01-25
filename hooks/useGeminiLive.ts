import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { pcmToGeminiBlob, base64ToUint8Array, decodeAudioData } from '../utils/audio';
import { CharacterProfile, ConnectionState, Message } from '../types';

// Supported Voices Map
const SAFE_VOICE_MAP: Record<string, string> = {
  'Puck': 'Puck', 'Charon': 'Charon', 'Fenrir': 'Fenrir', 'Lynx': 'Fenrir', 'Orion': 'Charon',
  'Kore': 'Kore', 'Zephyr': 'Zephyr', 'Aoede': 'Zephyr', 'Leda': 'Kore', 'Vega': 'Zephyr',
  'Kael': 'Fenrir', 'Ryu': 'Puck', 'Atlas': 'Charon', 'Neo': 'Puck', 'Dante': 'Fenrir',
  'Raiden': 'Fenrir', 'Haruto': 'Puck', 'Shinji': 'Puck', 'Ghost': 'Charon', 'Blitz': 'Fenrir',
  'Luna': 'Zephyr', 'Solaris': 'Kore', 'Nova': 'Zephyr', 'Aria': 'Zephyr', 'Viper': 'Kore',
  'Miko': 'Kore', 'Yuki': 'Zephyr', 'Hana': 'Puck', 'Pixie': 'Puck', 'Siren': 'Kore'
};

const timeTool: FunctionDeclaration = {
  name: 'getCurrentTime',
  description: 'Get local time.',
  parameters: { type: Type.OBJECT, properties: {} },
};

const mediaControlTool: FunctionDeclaration = {
  name: 'controlMedia',
  description: 'Execute only for: PLAY, PAUSE, STOP, RESUME, NEXT, PREVIOUS.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      command: { 
        type: Type.STRING, 
        enum: ['play', 'pause', 'next', 'previous', 'stop', 'resume', 'seek_forward', 'seek_backward'] 
      }
    },
    required: ['command']
  }
};

const laptopControlTool: FunctionDeclaration = {
  name: 'executeRemoteAction',
  description: 'Execute only for: OPEN/LAUNCH [app/site] or PLAY [media].',
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
    description: 'Check messages for [app].',
    parameters: {
        type: Type.OBJECT,
        properties: {
            platform: { type: Type.STRING },
            sender: { type: Type.STRING }
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
  const [isStandby, setIsStandby] = useState(false);
  const isStandbyRef = useRef(false);

  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const scheduledEndTimeRef = useRef<number>(0);
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
  
  // Buffers for accumulating text/sources during a turn
  const transcriptBufferRef = useRef<string>("");
  const modelOutputBufferRef = useRef<string>("");
  const groundingSourcesRef = useRef<{ title: string; uri: string }[]>([]);

  useEffect(() => { isStandbyRef.current = isStandby; }, [isStandby]);

  const stopAllAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => { try { source.stop(); } catch (e) {} });
    activeSourcesRef.current = [];
    if (outputContextRef.current) scheduledEndTimeRef.current = outputContextRef.current.currentTime;
  }, []);

  const enterStandby = useCallback(() => {
    setIsStandby(true);
    isStandbyRef.current = true;
    stopAllAudio();
  }, [stopAllAudio]);

  const exitStandby = useCallback(() => {
    setIsStandby(false);
    isStandbyRef.current = false;
    lastSpeechTimeRef.current = Date.now();
    if (outputContextRef.current) scheduledEndTimeRef.current = outputContextRef.current.currentTime;
  }, []);

  const disconnect = useCallback(async () => {
    isConnectedRef.current = false;
    if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);
    if (standbyCheckIntervalRef.current) clearInterval(standbyCheckIntervalRef.current);
    if (currentSessionRef.current) { try { currentSessionRef.current.close(); } catch (e) {} currentSessionRef.current = null; }

    stopAllAudio();
    activeConnectionParamsRef.current = null;
    transcriptBufferRef.current = "";
    modelOutputBufferRef.current = "";
    groundingSourcesRef.current = [];
    
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (processorNodeRef.current) { try { processorNodeRef.current.disconnect(); } catch(e) {} processorNodeRef.current = null; }
    if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch(e) {} sourceNodeRef.current = null; }
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') { try { await inputContextRef.current.close(); } catch(e) {} inputContextRef.current = null; }
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') { try { await outputContextRef.current.close(); } catch(e) {} outputContextRef.current = null; }
    
    setConnectionState('disconnected');
    setIsStandby(false);
    isStandbyRef.current = false;
    scheduledEndTimeRef.current = 0;
    setStreamingUserText("");
    setStreamingModelText("");
  }, [stopAllAudio]);

  const connect = useCallback(async () => {
    if (isConnectedRef.current || connectionState === 'connecting') return;
    if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);

    const apiKey = process.env.API_KEY;
    if (!apiKey) { setError("API Key Missing"); setConnectionState('error'); return; }

    setConnectionState('connecting');
    setError(null);
    activeConnectionParamsRef.current = { id: character.id, voiceName: character.voiceName, wakeWord: wakeWord, stopWord: stopWord };

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }});
        streamRef.current = stream;

        const audioCtxInput = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const audioCtxOutput = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        if (audioCtxInput.state === 'suspended') await audioCtxInput.resume();
        if (audioCtxOutput.state === 'suspended') await audioCtxOutput.resume();

        inputContextRef.current = audioCtxInput;
        outputContextRef.current = audioCtxOutput;

        const safeVoice = SAFE_VOICE_MAP[character.voiceName] || 'Puck';
        
        const finalSystemInstruction = `You are EVA. Voice: ${character.voiceName}. 
        PROTOCOLS:
        1. SPEED: Be extremely concise. 1-2 sentences max.
        2. KNOWLEDGE: Use Google Search to answer questions about latest news, events, weather, or facts.
        3. COMMANDS: Use 'executeRemoteAction' ONLY if user says OPEN, LAUNCH, PLAY.
        4. MEDIA: Use 'controlMedia' ONLY for PAUSE, RESUME, STOP, PLAY.
        ${wakeWord ? `5. WAKE: Listen for "${wakeWord}".` : ""}
        ${character.systemInstruction}`;

        const config = {
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } } },
            systemInstruction: finalSystemInstruction,
            inputAudioTranscription: {}, 
            outputAudioTranscription: {},
            // Enable Google Search alongside other tools
            tools: [
                { functionDeclarations: [timeTool, laptopControlTool, mediaControlTool, communicationTool] },
                { googleSearch: {} } 
            ]
          }
        };

        const ai = new GoogleGenAI({ apiKey });
        const session = await ai.live.connect({
            model: config.model,
            config: config.config,
            callbacks: {
                onopen: () => {
                    setConnectionState('connected');
                    isConnectedRef.current = true;
                    lastSpeechTimeRef.current = Date.now();
                    scheduledEndTimeRef.current = audioCtxOutput.currentTime;
                    transcriptBufferRef.current = "";
                    modelOutputBufferRef.current = "";
                    groundingSourcesRef.current = [];
                    
                    const source = audioCtxInput.createMediaStreamSource(stream);
                    const processor = audioCtxInput.createScriptProcessor(512, 1, 1);
                    
                    sourceNodeRef.current = source;
                    processorNodeRef.current = processor;

                    standbyCheckIntervalRef.current = setInterval(() => {
                        if (Date.now() - lastSpeechTimeRef.current > 60000 && isConnectedRef.current && !isStandbyRef.current) { 
                            enterStandby();
                        }
                    }, 5000);

                    processor.onaudioprocess = (e) => {
                      if (!isConnectedRef.current || !currentSessionRef.current) return;
                      
                      const inputData = e.inputBuffer.getChannelData(0);
                      
                      let sum = 0;
                      const len = inputData.length;
                      for(let i=0; i<len; i+=10) sum += Math.abs(inputData[i]); 
                      const vol = (sum / (len/10)) * 5; 
                      onVisualizerUpdate(vol); 
                      
                      if (vol > 0.05) lastSpeechTimeRef.current = Date.now();

                      try {
                         const blob = pcmToGeminiBlob(inputData, 16000);
                         currentSessionRef.current.sendRealtimeInput({ media: blob });
                      } catch (err) {
                         if (String(err).includes("CLOSING")) isConnectedRef.current = false;
                      }
                    };

                    source.connect(processor);
                    processor.connect(audioCtxInput.destination);
                },
                onmessage: async (msg: LiveServerMessage) => {
                    const { serverContent } = msg;

                    if (serverContent?.interrupted) {
                        stopAllAudio();
                        if (outputContextRef.current) scheduledEndTimeRef.current = outputContextRef.current.currentTime;
                        modelOutputBufferRef.current = ""; // Clear buffer on interruption
                        return; 
                    }

                    // --- HANDLE USER TRANSCRIPT ---
                    if (serverContent?.inputTranscription?.text) {
                      const text = serverContent.inputTranscription.text;
                      setStreamingUserText(prev => prev + text);
                      transcriptBufferRef.current += (" " + text);
                      const bufferLower = transcriptBufferRef.current.toLowerCase();
                      
                      if (wakeWord && bufferLower.includes(wakeWord.toLowerCase()) && isStandbyRef.current) {
                          exitStandby();
                          transcriptBufferRef.current = ""; 
                      }
                      if ((stopWord && bufferLower.includes(stopWord.toLowerCase())) || bufferLower.includes("thank you")) {
                          if (!isStandbyRef.current) { enterStandby(); transcriptBufferRef.current = ""; }
                      }
                    }

                    // --- HANDLE MODEL TRANSCRIPT (Sources & Text) ---
                    // Capture grounding metadata for sources
                    const anyContent = serverContent as any;
                    if (anyContent?.modelTurn?.groundingMetadata?.groundingChunks) {
                         const chunks = anyContent.modelTurn.groundingMetadata.groundingChunks;
                         const newSources = chunks
                             .map((c: any) => c.web ? { title: c.web.title, uri: c.web.uri } : null)
                             .filter(Boolean);
                         if (newSources.length > 0) {
                             const combined = [...groundingSourcesRef.current, ...newSources];
                             // Dedup
                             groundingSourcesRef.current = Array.from(new Map(combined.map(item => [item.uri, item])).values());
                         }
                    }

                    // Capture model text output
                    if (serverContent?.outputTranscription?.text) {
                        const text = serverContent.outputTranscription.text;
                        setStreamingModelText(prev => prev + text);
                        modelOutputBufferRef.current += text;
                    }

                    // --- TURN COMPLETE: COMMIT TO HISTORY ---
                    if (serverContent?.turnComplete) {
                        const userText = transcriptBufferRef.current.trim();
                        const modelText = modelOutputBufferRef.current.trim();
                        
                        if (userText || modelText) {
                            setMessages(prev => {
                                const newMsgs = [...prev];
                                if (userText) {
                                    newMsgs.push({
                                        id: Date.now() + '_user',
                                        role: 'user',
                                        text: userText,
                                        timestamp: new Date()
                                    });
                                }
                                if (modelText) {
                                    newMsgs.push({
                                        id: Date.now() + '_model',
                                        role: 'model',
                                        text: modelText,
                                        timestamp: new Date(),
                                        sources: groundingSourcesRef.current.length > 0 ? [...groundingSourcesRef.current] : undefined
                                    });
                                }
                                return newMsgs;
                            });
                        }
                        
                        // Reset Buffers
                        transcriptBufferRef.current = "";
                        modelOutputBufferRef.current = "";
                        groundingSourcesRef.current = [];
                        setStreamingUserText("");
                        setStreamingModelText("");
                    }

                    if (isStandbyRef.current) return;
                    
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
                        if (scheduledEndTimeRef.current < currentTime) {
                            scheduledEndTimeRef.current = currentTime + 0.04;
                        }
                        
                        source.start(scheduledEndTimeRef.current);
                        scheduledEndTimeRef.current += audioBuffer.duration;
                    }
                    
                    if (msg.toolCall && msg.toolCall.functionCalls) {
                        for (const fc of msg.toolCall.functionCalls) {
                            let result: any = { status: 'ok' };
                            
                            if (fc.name === 'checkMessages') {
                                const args = fc.args as any;
                                const platform = args.platform || 'whatsapp';
                                const sender = args.sender ? ` from ${args.sender}` : '';
                                
                                if (isRemoteMode) {
                                    sendRemoteCommand('open_app', platform);
                                    result = { status: 'opened', details: `Opened ${platform} on remote` };
                                } else {
                                    let uri = '';
                                    const p = platform.toLowerCase();
                                    if (p.includes('whatsapp')) uri = 'whatsapp://';
                                    else if (p.includes('discord')) uri = 'discord://';
                                    else uri = 'https://www.google.com/search?q=' + platform;
                                    if (uri.startsWith('http')) window.open(uri, '_blank');
                                    else window.location.assign(uri);
                                    result = { status: 'opened', message: `Opened ${platform}${sender}.` };
                                }
                            }
                            else if (fc.name === 'controlMedia') {
                                const args = fc.args as any;
                                const cmd = args.command;
                                if (cmd === 'pause' || cmd === 'stop') stopAllAudio();
                                
                                const mediaElements = document.querySelectorAll('video, audio');
                                mediaElements.forEach((el: any) => {
                                    try {
                                        if (cmd === 'pause' || cmd === 'stop') el.pause();
                                        if (cmd === 'play' || cmd === 'resume') el.play().catch(() => {});
                                    } catch(e) {}
                                });
                                if (onMediaCommand) onMediaCommand(cmd);
                                
                                if (isRemoteMode) sendRemoteCommand('media_control', cmd);
                                else {
                                     let key = '';
                                     if (cmd === 'play' || cmd === 'pause' || cmd === 'resume') key = 'MediaPlayPause';
                                     else if (cmd === 'next') key = 'MediaTrackNext';
                                     else if (cmd === 'previous') key = 'MediaTrackPrevious';
                                     else if (cmd === 'stop') key = 'MediaStop';
                                     else if (cmd === 'seek_forward') key = 'ArrowRight'; 
                                     else if (cmd === 'seek_backward') key = 'ArrowLeft'; 
                                     if (key) try { document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true })); } catch(e) {}
                                }
                                result = { status: 'ok', command: cmd };
                            } 
                            else if (fc.name === 'executeRemoteAction') {
                                const args = fc.args as any;
                                if (isRemoteMode) sendRemoteCommand(args.action, args.query);
                                else {
                                    setTimeout(() => {
                                        if (args.action === 'open_url') window.open(args.query.startsWith('http') ? args.query : 'https://'+args.query, '_blank');
                                        else if (args.action === 'play_music') window.location.assign(`spotify:search:${encodeURIComponent(args.query)}`);
                                        else if (args.action === 'play_video') window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`, '_blank');
                                        else if (args.action === 'open_app') {
                                             const q = args.query.toLowerCase();
                                             if (q.includes('youtube')) window.location.assign('https://www.youtube.com');
                                             else if (q.includes('whatsapp')) window.location.assign('whatsapp://');
                                             else if (q.includes('discord')) window.location.assign('discord://');
                                             else if (q.includes('calculator')) window.location.assign('calculator:');
                                             else window.open(`https://www.google.com/search?q=${encodeURIComponent(args.query)}`, '_blank');
                                        }
                                    }, 50);
                                }
                            } 
                            session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: result } });
                        }
                    }
                },
                onclose: () => {
                    setConnectionState('disconnected');
                    isConnectedRef.current = false;
                    currentSessionRef.current = null;
                    setIsStandby(false);
                    isStandbyRef.current = false;
                    if (autoReconnect && !error?.includes("Permission") && !isReconnectingRef.current) {
                        autoReconnectTimerRef.current = setTimeout(() => connect(), 2000);
                    }
                },
                onerror: (err: any) => {
                    const msg = String(err);
                    if (!msg.includes("Network error")) { setError(msg); setConnectionState('error'); }
                    isConnectedRef.current = false;
                }
            }
        });
        currentSessionRef.current = session;
    } catch (e: any) { setError(e.message); setConnectionState('error'); }
  }, [character, onVisualizerUpdate, stopAllAudio, isRemoteMode, sendRemoteCommand, autoReconnect, wakeWord, onMediaCommand, stopWord, connectionState, enterStandby, exitStandby]);

  useEffect(() => {
    if (connectionState === 'connected' && activeConnectionParamsRef.current && !isReconnectingRef.current) {
        const active = activeConnectionParamsRef.current;
        if (active.id !== character.id || active.voiceName !== character.voiceName || active.wakeWord !== wakeWord || active.stopWord !== stopWord) {
            isReconnectingRef.current = true;
            disconnect().then(() => {
                setTimeout(() => { connect().finally(() => { isReconnectingRef.current = false; }); }, 200); 
            });
        }
    }
  }, [character, connect, disconnect, connectionState, wakeWord, stopWord]);

  return { connect, disconnect, connectionState, messages, streamingUserText, streamingModelText, error, isStandby };
};