import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { pcmToGeminiBlob, base64ToUint8Array, decodeAudioData, hasSpeech, concatUint8Arrays } from '../utils/audio';
import { CharacterProfile, ConnectionState, Message } from '../types';
import { executeLocalAction } from '../utils/launcher';

// Supported Voices Map
const SAFE_VOICE_MAP: Record<string, string> = {
  'Puck': 'Puck', 'Kael': 'Puck', 'Neo': 'Puck', 'Haruto': 'Puck', 'Shinji': 'Puck',
  'Charon': 'Charon', 'Aqua': 'Charon', 'Atlas': 'Charon', 'Ghost': 'Charon', 'Orion': 'Charon',
  'Fenrir': 'Fenrir', 'Ryu': 'Fenrir', 'Dante': 'Fenrir', 'Raiden': 'Fenrir', 'Blitz': 'Fenrir', 'Lynx': 'Fenrir',
  'Kore': 'Kore', 'Akane': 'Kore', 'Nova': 'Kore', 'Aria': 'Kore', 'Miko': 'Kore', 'Leda': 'Kore',
  'Aoede': 'Aoede', 'Ai': 'Aoede', 'Kana': 'Aoede', 'Solaris': 'Aoede', 'Viper': 'Aoede', 'Hana': 'Aoede', 'Pixie': 'Aoede',
  'Zephyr': 'Zephyr', 'Ruby': 'Zephyr', 'Luna': 'Zephyr', 'Yuki': 'Zephyr', 'Siren': 'Zephyr', 'Vega': 'Zephyr'
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
  onToolExecuted?: (toolName: string, args: any) => void;
  isLowLatencyMode?: boolean;
  isEcoMode?: boolean;
}

export const useGeminiLive = ({ character, onVisualizerUpdate, isRemoteMode, sendRemoteCommand, autoReconnect, wakeWord, stopWord, onMediaCommand, onToolExecuted, isLowLatencyMode = false, isEcoMode = false }: UseGeminiLiveProps) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStandby, setIsStandby] = useState(false);
  const isStandbyRef = useRef(false);

  // Connection & Audio Refs
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const scheduledEndTimeRef = useRef<number>(0);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const currentSessionRef = useRef<any>(null);
  
  // State Refs for Logic
  const activeConnectionParamsRef = useRef<{ id: string, voiceName: string, wakeWord?: string, stopWord?: string, isLowLatency?: boolean } | null>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const isConnectedRef = useRef<boolean>(false);
  const lastDisconnectTimeRef = useRef<number>(0);
  const hasErrorRef = useRef<boolean>(false); // CRITICAL FIX: Tracks errors synchronously
  
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const autoReconnectTimerRef = useRef<any>(null);
  const lastSpeechTimeRef = useRef<number>(Date.now());
  const standbyCheckIntervalRef = useRef<any>(null);
  const heartbeatIntervalRef = useRef<any>(null);
  
  const transcriptBufferRef = useRef<string>("");
  const modelOutputBufferRef = useRef<string>("");
  const groundingSourcesRef = useRef<{ title: string; uri: string }[]>([]);
  
  const audioChunksBufferRef = useRef<string[]>([]); 
  const isProcessingAudioRef = useRef<boolean>(false);
  const silencePacketCountRef = useRef<number>(0); 

  useEffect(() => { isStandbyRef.current = isStandby; }, [isStandby]);

  const stopAllAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => { 
        try { source.stop(); source.disconnect(); } catch (e) {} 
    });
    activeSourcesRef.current = [];
    if (outputContextRef.current) scheduledEndTimeRef.current = outputContextRef.current.currentTime;
    audioChunksBufferRef.current = []; 
    isProcessingAudioRef.current = false; 
  }, []);

  const enterStandby = useCallback(() => {
    console.log("Entering Standby Mode");
    setIsStandby(true);
    isStandbyRef.current = true;
    stopAllAudio();
  }, [stopAllAudio]);

  const exitStandby = useCallback(() => {
    console.log("Exiting Standby Mode");
    setIsStandby(false);
    isStandbyRef.current = false;
    lastSpeechTimeRef.current = Date.now();
    if (outputContextRef.current) scheduledEndTimeRef.current = outputContextRef.current.currentTime;
  }, []);

  const disconnect = useCallback(async () => {
    lastDisconnectTimeRef.current = Date.now();
    isConnectedRef.current = false;
    
    if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);
    if (standbyCheckIntervalRef.current) clearInterval(standbyCheckIntervalRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    
    if (currentSessionRef.current) { try { currentSessionRef.current.close(); } catch (e) {} currentSessionRef.current = null; }

    stopAllAudio();
    activeConnectionParamsRef.current = null;
    transcriptBufferRef.current = "";
    modelOutputBufferRef.current = "";
    groundingSourcesRef.current = [];
    silencePacketCountRef.current = 0;
    
    if (streamRef.current) { 
        streamRef.current.getTracks().forEach(track => track.stop()); 
        streamRef.current = null; 
    }
    if (processorNodeRef.current) { try { processorNodeRef.current.disconnect(); } catch(e) {} processorNodeRef.current = null; }
    if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch(e) {} sourceNodeRef.current = null; }
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') { try { await inputContextRef.current.close(); } catch(e) {} inputContextRef.current = null; }
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') { try { await outputContextRef.current.close(); } catch(e) {} outputContextRef.current = null; }
    
    setConnectionState('disconnected');
    setIsStandby(false);
    isStandbyRef.current = false;
    scheduledEndTimeRef.current = 0;
  }, [stopAllAudio]);

  const processAudioQueue = useCallback(() => {
      if (isProcessingAudioRef.current || !outputContextRef.current) return;
      isProcessingAudioRef.current = true;

      try {
          if (audioChunksBufferRef.current.length === 0) {
              isProcessingAudioRef.current = false;
              return;
          }

          const chunksToProcess = [...audioChunksBufferRef.current];
          audioChunksBufferRef.current = [];

          if (!isConnectedRef.current || isStandbyRef.current) {
              isProcessingAudioRef.current = false;
              return;
          }

          const ctx = outputContextRef.current;
          const byteArrays = chunksToProcess.map(base64ToUint8Array);
          const combinedUint8 = concatUint8Arrays(byteArrays);
          const audioBuffer = decodeAudioData(combinedUint8, ctx, 24000);
          
          const currentTime = ctx.currentTime;
          const BUFFER_SAFETY_MARGIN = isEcoMode ? 0.1 : 0.01; 

          if (scheduledEndTimeRef.current < currentTime) {
              scheduledEndTimeRef.current = currentTime + BUFFER_SAFETY_MARGIN; 
          }

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          
          source.start(scheduledEndTimeRef.current);
          scheduledEndTimeRef.current += audioBuffer.duration;
          
          activeSourcesRef.current.push(source);
          source.onended = () => {
              source.disconnect(); 
              activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
          };

      } catch (e) {
          console.error("Audio processing error", e);
      } finally {
          isProcessingAudioRef.current = false;
          if (!isEcoMode && audioChunksBufferRef.current.length > 0) {
              setTimeout(processAudioQueue, 0);
          }
      }
  }, [isEcoMode]);

  const connect = useCallback(async () => {
    if (isConnectedRef.current || connectionState === 'connecting') return;
    if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);

    // Debounce rapid reconnects
    if (Date.now() - lastDisconnectTimeRef.current < 1500) {
         console.warn("Rapid reconnect detected. Cooling down.");
         autoReconnectTimerRef.current = setTimeout(() => connect(), 2000);
         return;
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) { setError("API Key Missing"); setConnectionState('error'); return; }

    setConnectionState('connecting');
    setError(null);
    hasErrorRef.current = false; // Reset error flag
    
    activeConnectionParamsRef.current = { id: character.id, voiceName: character.voiceName, wakeWord: wakeWord, stopWord: stopWord, isLowLatency: isLowLatencyMode };

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }});
        streamRef.current = stream;

        const audioCtxInput = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const audioCtxOutput = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000, latencyHint: 'interactive' });
        
        heartbeatIntervalRef.current = setInterval(() => {
            if (audioCtxOutput.state === 'suspended') audioCtxOutput.resume(); 
            if (audioCtxInput.state === 'suspended') audioCtxInput.resume();
        }, 2000);

        await audioCtxInput.resume();
        await audioCtxOutput.resume();

        inputContextRef.current = audioCtxInput;
        outputContextRef.current = audioCtxOutput;

        const safeVoice = SAFE_VOICE_MAP[character.voiceName] || 'Puck';
        
        const finalSystemInstruction = `
You are EVA AI, optimized STRICTLY for low-end Android devices.

DEVICE PROFILE:
- Device: Huawei P10 Lite (Low RAM/CPU)
- Priority: STABILITY over speed.

CRITICAL RULES (MUST FOLLOW):
1. KEEP RESPONSES SHORT. Aim for 1 sentence, max 2.
2. DO NOT use markdown, emojis, formatting, or lists. Plain text only.
3. DO NOT repeat words.
4. DO NOT say "processing" or "thinking".
5. Generate the FULL response text internally before speaking.
6. SKIP pleasantries.

SYSTEM INSTRUCTION OVERRIDE:
${character.systemInstruction || "You are a helpful AI assistant."}

${wakeWord ? `WAKE WORD: Listen for "${wakeWord}".` : ""}
`;

        const config = {
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } } },
            systemInstruction: finalSystemInstruction,
            inputAudioTranscription: {}, 
            outputAudioTranscription: {},
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
                    audioChunksBufferRef.current = [];
                    silencePacketCountRef.current = 0;
                    
                    const source = audioCtxInput.createMediaStreamSource(stream);
                    const bufferSize = isLowLatencyMode ? 1024 : 2048;
                    const processor = audioCtxInput.createScriptProcessor(bufferSize, 1, 1);
                    
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
                      
                      // Calculate volume efficiently
                      let sum = 0;
                      for(let i=0; i<inputData.length; i+=50) sum += Math.abs(inputData[i]); 
                      const vol = (sum / (inputData.length/50)) * 5; 
                      
                      const isAiSpeaking = activeSourcesRef.current.length > 0;
                      const NOISE_THRESHOLD = isAiSpeaking ? 0.2 : 0.01; 
                      
                      if (vol < NOISE_THRESHOLD) {
                          if (isEcoMode) {
                              silencePacketCountRef.current++;
                              if (silencePacketCountRef.current > 10) return; 
                          }
                      } else {
                          silencePacketCountRef.current = 0;
                          if (vol > 0.05) lastSpeechTimeRef.current = Date.now();
                      }
                      
                      if (vol > 0.01) onVisualizerUpdate(vol);

                      try {
                         const blob = pcmToGeminiBlob(inputData, 16000);
                         currentSessionRef.current.sendRealtimeInput({ media: blob });
                      } catch (err) {
                         if (String(err).includes("CLOSING") || String(err).includes("closed")) {
                             isConnectedRef.current = false;
                         }
                      }
                    };

                    source.connect(processor);
                    processor.connect(audioCtxInput.destination);
                },
                onmessage: async (msg: LiveServerMessage) => {
                    const { serverContent } = msg;
                    if (serverContent?.interrupted) return;

                    if (serverContent?.inputTranscription?.text) {
                      const text = serverContent.inputTranscription.text;
                      transcriptBufferRef.current += (" " + text);
                      
                      if (transcriptBufferRef.current.length > 500) {
                          transcriptBufferRef.current = transcriptBufferRef.current.substring(transcriptBufferRef.current.length - 500);
                      }
                      
                      const bufferLower = transcriptBufferRef.current.toLowerCase();
                      
                      if (wakeWord && isStandbyRef.current) {
                          const cleanWake = wakeWord.toLowerCase().trim();
                          if (cleanWake && bufferLower.includes(cleanWake)) {
                              exitStandby();
                              transcriptBufferRef.current = ""; 
                          }
                      }

                      if (stopWord && !isStandbyRef.current) {
                          const cleanStop = stopWord.toLowerCase().trim();
                          if (cleanStop && bufferLower.includes(cleanStop)) {
                              enterStandby();
                              transcriptBufferRef.current = ""; 
                          }
                      }
                    }

                    const audioData = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData) {
                        audioChunksBufferRef.current.push(audioData);
                        if (!isStandbyRef.current && !isEcoMode) {
                            processAudioQueue();
                        }
                    }

                    if (serverContent?.turnComplete) {
                        if (!isStandbyRef.current && isEcoMode) {
                            processAudioQueue();
                        }
                        transcriptBufferRef.current = "";
                        modelOutputBufferRef.current = "";
                        groundingSourcesRef.current = [];
                    }
                    
                    if (msg.toolCall && msg.toolCall.functionCalls) {
                        for (const fc of msg.toolCall.functionCalls) {
                            const fcName = fc.name || "unknown_tool";
                            const fcId = fc.id || "unknown_id";
                            const fcArgs = fc.args || {};
                            let result: any = { status: 'ok' };
                            if (onToolExecuted) onToolExecuted(fcName, fcArgs);

                            if (fcName === 'checkMessages') { /* ... */ }
                            else if (fcName === 'controlMedia') {
                                const args = fcArgs as any;
                                if (args.command === 'pause' || args.command === 'stop') stopAllAudio();
                                if (onMediaCommand) onMediaCommand(args.command);
                                if (isRemoteMode) sendRemoteCommand('media_control', args.command);
                                result = { status: 'ok', command: args.command };
                            } 
                            else if (fcName === 'executeRemoteAction') {
                                const args = fcArgs as any;
                                if (isRemoteMode) sendRemoteCommand(args.action, args.query);
                                else executeLocalAction(args.action, args.query);
                            } 
                            session.sendToolResponse({ functionResponses: [{ id: fcId, name: fcName, response: result }] });
                        }
                    }
                },
                onclose: () => {
                    setConnectionState('disconnected');
                    isConnectedRef.current = false;
                    currentSessionRef.current = null;
                    setIsStandby(false);
                    isStandbyRef.current = false;
                    
                    // STOP LOOP: Only autoreconnect if NO ERROR occurred
                    if (autoReconnect && !hasErrorRef.current && !isReconnectingRef.current) {
                        autoReconnectTimerRef.current = setTimeout(() => connect(), 2000);
                    }
                },
                onerror: (err: any) => {
                    const msg = String(err);
                    console.error("Gemini Error:", msg);
                    
                    // Filter benign network glitches
                    if (!msg.includes("Network error") && !msg.includes("aborted")) { 
                        setError(msg); 
                        setConnectionState('error'); 
                        hasErrorRef.current = true; // Mark that an error occurred
                    }
                    isConnectedRef.current = false;
                }
            }
        });
        currentSessionRef.current = session;
    } catch (e: any) { 
        setError(e.message); 
        setConnectionState('error'); 
        hasErrorRef.current = true;
    }
  }, [character, onVisualizerUpdate, stopAllAudio, isRemoteMode, sendRemoteCommand, autoReconnect, wakeWord, onMediaCommand, stopWord, connectionState, enterStandby, exitStandby, isLowLatencyMode, isEcoMode, onToolExecuted, processAudioQueue]);

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
  }, [character, connect, disconnect, connectionState, wakeWord, stopWord, isLowLatencyMode]);

  return { connect, disconnect, connectionState, messages, error, isStandby };
};
