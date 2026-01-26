import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { pcmToGeminiBlob, base64ToUint8Array, decodeAudioData, hasSpeech } from '../utils/audio';
import { CharacterProfile, ConnectionState, Message } from '../types';
import { executeLocalAction } from '../utils/launcher';

// Supported Voices Map
// Maps internal app voice names to Gemini API prebuilt voices
const SAFE_VOICE_MAP: Record<string, string> = {
  // Originals
  'Puck': 'Puck', 'Charon': 'Charon', 'Fenrir': 'Fenrir', 'Lynx': 'Fenrir', 'Orion': 'Charon',
  'Kore': 'Kore', 'Zephyr': 'Zephyr', 'Aoede': 'Zephyr', 'Leda': 'Kore', 'Vega': 'Zephyr',
  // Anime Generic
  'Kael': 'Fenrir', 'Ryu': 'Puck', 'Atlas': 'Charon', 'Neo': 'Puck', 'Dante': 'Fenrir',
  'Raiden': 'Fenrir', 'Haruto': 'Puck', 'Shinji': 'Puck', 'Ghost': 'Charon', 'Blitz': 'Fenrir',
  'Luna': 'Zephyr', 'Solaris': 'Kore', 'Nova': 'Zephyr', 'Aria': 'Zephyr', 'Viper': 'Kore',
  'Miko': 'Kore', 'Yuki': 'Zephyr', 'Hana': 'Puck', 'Pixie': 'Puck', 'Siren': 'Kore',
  // Oshi no Ko Specific Mappings
  'Ai': 'Aoede',     // High pitched, energetic, confident
  'Aqua': 'Charon',  // Deep, calm, serious
  'Ruby': 'Puck',    // Playful, energetic, slightly chaotic
  'Kana': 'Fenrir',  // Expressive, intense (Tsundere vibes)
  'Akane': 'Leda'    // Soft spoken, intellectual, method actor
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

  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const scheduledEndTimeRef = useRef<number>(0);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const currentSessionRef = useRef<any>(null);
  
  const activeConnectionParamsRef = useRef<{ id: string, voiceName: string, wakeWord?: string, stopWord?: string, isLowLatency?: boolean } | null>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const isConnectedRef = useRef<boolean>(false);
  
  // Use a Set for active sources for easier management, but we need to be careful with memory
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const autoReconnectTimerRef = useRef<any>(null);
  const lastSpeechTimeRef = useRef<number>(Date.now());
  const standbyCheckIntervalRef = useRef<any>(null);
  const heartbeatIntervalRef = useRef<any>(null);
  
  // Buffers & Optimization
  const transcriptBufferRef = useRef<string>("");
  const modelOutputBufferRef = useRef<string>("");
  const groundingSourcesRef = useRef<{ title: string; uri: string }[]>([]);
  
  const audioChunksBufferRef = useRef<string[]>([]); 
  const isProcessingAudioRef = useRef<boolean>(false);
  const silencePacketCountRef = useRef<number>(0); // Track silence for bandwidth optimization

  useEffect(() => { isStandbyRef.current = isStandby; }, [isStandby]);

  const stopAllAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => { 
        try { source.stop(); source.disconnect(); } catch (e) {} 
    });
    activeSourcesRef.current = [];
    if (outputContextRef.current) scheduledEndTimeRef.current = outputContextRef.current.currentTime;
    audioChunksBufferRef.current = []; // Clear buffer
    isProcessingAudioRef.current = false; // Reset processing lock
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
    
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (processorNodeRef.current) { try { processorNodeRef.current.disconnect(); } catch(e) {} processorNodeRef.current = null; }
    if (sourceNodeRef.current) { try { sourceNodeRef.current.disconnect(); } catch(e) {} sourceNodeRef.current = null; }
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') { try { await inputContextRef.current.close(); } catch(e) {} inputContextRef.current = null; }
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') { try { await outputContextRef.current.close(); } catch(e) {} outputContextRef.current = null; }
    
    setConnectionState('disconnected');
    setIsStandby(false);
    isStandbyRef.current = false;
    scheduledEndTimeRef.current = 0;
  }, [stopAllAudio]);

  // Serial Audio Processor with Aggressive Lag Protection
  const processAudioQueue = async () => {
      if (isProcessingAudioRef.current || !outputContextRef.current) return;
      isProcessingAudioRef.current = true;

      try {
          // LAG PROTECTION / SLOW DEVICE OPTIMIZATION:
          // In Eco Mode: extremely aggressive pruning (keep only 2 chunks)
          // Standard: Keep max 3 chunks (was 5) to reduce latency
          const MAX_BUFFER = isEcoMode ? 2 : 3;

          if (audioChunksBufferRef.current.length > MAX_BUFFER) {
              // console.warn(`Lag detected (${audioChunksBufferRef.current.length} chunks). Pruning.`);
              // Keep only the last 1-2 chunks to ensure continuity but jump ahead
              audioChunksBufferRef.current = audioChunksBufferRef.current.slice(-2);
              // Important: Reset timing to "now" to avoid accelerated playback of the remaining chunks
              scheduledEndTimeRef.current = outputContextRef.current.currentTime;
          }

          while (audioChunksBufferRef.current.length > 0) {
              if (!isConnectedRef.current || isStandbyRef.current) {
                  audioChunksBufferRef.current = [];
                  break;
              }

              const chunk = audioChunksBufferRef.current[0];
              try {
                  const ctx = outputContextRef.current;
                  const audioBuffer = await decodeAudioData(base64ToUint8Array(chunk), ctx, 24000);
                  
                  // Only remove from queue after successful decode
                  audioChunksBufferRef.current.shift();

                  // SYNC CORRECTION:
                  if (scheduledEndTimeRef.current < ctx.currentTime) {
                      scheduledEndTimeRef.current = ctx.currentTime;
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
                  console.error("Audio decode error", e);
                  audioChunksBufferRef.current.shift(); // Remove corrupted chunk
              }
          }
      } finally {
          isProcessingAudioRef.current = false;
      }
  };

  const connect = useCallback(async () => {
    if (isConnectedRef.current || connectionState === 'connecting') return;
    if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);

    const apiKey = process.env.API_KEY;
    if (!apiKey) { setError("API Key Missing"); setConnectionState('error'); return; }

    setConnectionState('connecting');
    setError(null);
    activeConnectionParamsRef.current = { id: character.id, voiceName: character.voiceName, wakeWord: wakeWord, stopWord: stopWord, isLowLatency: isLowLatencyMode };

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }});
        streamRef.current = stream;

        const audioCtxInput = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const audioCtxOutput = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        // --- ANDROID STABILITY: HEARTBEAT ---
        heartbeatIntervalRef.current = setInterval(() => {
            if (audioCtxOutput.state === 'suspended') audioCtxOutput.resume(); 
            if (audioCtxInput.state === 'suspended') audioCtxInput.resume();
        }, 2000);

        if (audioCtxInput.state === 'suspended') await audioCtxInput.resume();
        if (audioCtxOutput.state === 'suspended') await audioCtxOutput.resume();

        inputContextRef.current = audioCtxInput;
        outputContextRef.current = audioCtxOutput;

        const safeVoice = SAFE_VOICE_MAP[character.voiceName] || 'Puck';
        
        const finalSystemInstruction = `
You are a desktop voice assistant that controls my laptop directly.
Voice: ${character.voiceName}. 
Personality Override: ${character.systemInstruction}

LANGUAGE PROTOCOL:
- STRICTLY SPEAK AND LISTEN IN ENGLISH ONLY.
- Regardless of the user's input language, ALWAYS respond in English.
- Interpret all input within an English context.

GENERAL BEHAVIOR:
- Always listen for voice commands.
- Respond quickly and clearly.
- Do not add unnecessary animations, confirmations, or explanations.
- If a command is clear, execute it immediately without hesitation via the provided tools.

DEVICE & CONNECTION RULES:
- My phone or any other device may already be connected to my laptop.
- Accept commands from any connected device.
- Treat all connected devices as authorized controllers.
- Do not ask for permission again once a device is connected.

VOICE-ONLY RESPONSES (NO APPS SHOULD OPEN):
When I ask questions like:
- "What is the time?"
- "What is the weather?"
- "What’s the news?"
- "Tell me today’s date"
- Any general knowledge or small talk question

→ Respond only with spoken or text answers.
→ Do NOT open browsers, apps, or windows.

ACTION COMMANDS (APPS & WEBSITES MUST OPEN):
When I say commands like:
- "Open Spotify"
- "Open YouTube"
- "Open Google"
- "Open my browser"
- "Open settings"
- "Open any app installed on my laptop"
- "Open a website" (example: open youtube.com)

→ Instantly open the requested app or website on my laptop by calling the 'executeRemoteAction' tool.
→ Use 'open_app' for applications and 'open_url' for specific websites.
→ Do not ask follow-up questions unless the command is unclear.

APP HANDLING:
- If the app exists on the laptop (e.g. Spotify, Discord, VSCode), open it using 'open_app'.
- If the app is not installed, open its official website instead.

WEBSITE HANDLING:
- If I say a website name, open it directly.
- If I say a search-style request, open the browser and search it.

PRIORITY RULE:
- If a command sounds like an ACTION → open or execute it using a Tool.
- If a command sounds like a QUESTION → reply only with speech.

ERROR HANDLING:
- If something cannot be opened, briefly say why.
- Offer one simple alternative, then stop.

You are optimized for speed, clarity, and hands-free laptop control.
TOOLS: Use 'executeRemoteAction' for opening things, 'controlMedia' for playback, 'googleSearch' for information.
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
                    
                    // PERFORMANCE: 4096 buffer for Eco Mode (Low CPU), 2048 for Low Latency
                    const bufferSize = isEcoMode ? 4096 : 2048;
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
                      
                      // VISUALIZER OPTIMIZATION:
                      let sum = 0;
                      for(let i=0; i<inputData.length; i+=50) sum += Math.abs(inputData[i]); 
                      const vol = (sum / (inputData.length/50)) * 5; 
                      
                      // VAD / BANDWIDTH OPTIMIZATION (Eco Mode)
                      if (isEcoMode) {
                          const speechDetected = hasSpeech(inputData, 0.01);
                          if (!speechDetected) {
                              silencePacketCountRef.current++;
                              if (silencePacketCountRef.current > 2) return; 
                          } else {
                              silencePacketCountRef.current = 0;
                              lastSpeechTimeRef.current = Date.now();
                          }
                      } else {
                          if (vol > 0.05) lastSpeechTimeRef.current = Date.now();
                      }
                      
                      if (vol > 0.01) onVisualizerUpdate(vol);

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
                        modelOutputBufferRef.current = ""; 
                        return; 
                    }

                    // --- HANDLE USER TRANSCRIPT ---
                    if (serverContent?.inputTranscription?.text) {
                      const text = serverContent.inputTranscription.text;
                      // Safe buffer accumulation
                      transcriptBufferRef.current += (" " + text);
                      
                      // Keep buffer size manageable (max 500 chars)
                      if (transcriptBufferRef.current.length > 500) {
                          transcriptBufferRef.current = transcriptBufferRef.current.substring(transcriptBufferRef.current.length - 500);
                      }
                      
                      const bufferLower = transcriptBufferRef.current.toLowerCase();
                      
                      // --- WAKE WORD DETECTION (Paused -> Active) ---
                      if (wakeWord && isStandbyRef.current) {
                          const cleanWake = wakeWord.toLowerCase().trim();
                          if (cleanWake && bufferLower.includes(cleanWake)) {
                              exitStandby();
                              transcriptBufferRef.current = ""; 
                          }
                      }

                      // --- STOP WORD DETECTION (Active -> Paused) ---
                      if (stopWord && !isStandbyRef.current) {
                          const cleanStop = stopWord.toLowerCase().trim();
                          if (cleanStop && bufferLower.includes(cleanStop)) {
                              enterStandby();
                              transcriptBufferRef.current = ""; 
                          }
                      }
                      
                      // Legacy "Thank you" stop command (Backup)
                      if (!isStandbyRef.current && bufferLower.includes("thank you")) {
                          enterStandby();
                          transcriptBufferRef.current = ""; 
                      }
                    }

                    // --- HANDLE MODEL OUTPUT ---
                    const anyContent = serverContent as any;
                    if (anyContent?.modelTurn?.groundingMetadata?.groundingChunks) {
                         const chunks = anyContent.modelTurn.groundingMetadata.groundingChunks;
                         const newSources = chunks
                             .map((c: any) => c.web ? { title: c.web.title, uri: c.web.uri } : null)
                             .filter(Boolean);
                         if (newSources.length > 0) {
                             const combined = [...groundingSourcesRef.current, ...newSources];
                             groundingSourcesRef.current = Array.from(new Map(combined.map(item => [item.uri, item])).values());
                         }
                    }

                    if (serverContent?.outputTranscription?.text) {
                        modelOutputBufferRef.current += serverContent.outputTranscription.text;
                    }

                    // Buffer Audio Chunks
                    const audioData = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData) {
                        audioChunksBufferRef.current.push(audioData);
                        // Trigger processing loop
                        if (!isStandbyRef.current) {
                            processAudioQueue();
                        } else {
                            audioChunksBufferRef.current = []; // Discard audio if in standby
                        }
                    }

                    // --- TURN COMPLETE ---
                    if (serverContent?.turnComplete) {
                        const userText = transcriptBufferRef.current.trim();
                        const modelText = modelOutputBufferRef.current.trim();
                        
                        if (userText || modelText) {
                            setMessages(prev => {
                                let newMsgs = [...prev];
                                if (userText) newMsgs.push({ id: Date.now() + '_user', role: 'user', text: userText, timestamp: new Date() });
                                if (modelText) newMsgs.push({ id: Date.now() + '_model', role: 'model', text: modelText, timestamp: new Date(), sources: groundingSourcesRef.current.length > 0 ? [...groundingSourcesRef.current] : undefined });
                                
                                // MEMORY SAFETY: Prune to last 20 messages
                                if (newMsgs.length > 20) newMsgs = newMsgs.slice(newMsgs.length - 20);
                                return newMsgs;
                            });
                        }
                        
                        transcriptBufferRef.current = "";
                        modelOutputBufferRef.current = "";
                        groundingSourcesRef.current = [];
                    }
                    
                    // Tool Calling Logic
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
                                else {
                                    // Execute locally if not in remote mode
                                    executeLocalAction(args.action, args.query);
                                }
                            } 
                            session.sendToolResponse({ 
                              functionResponses: [{ 
                                id: fcId, 
                                name: fcName, 
                                response: result 
                              }] 
                            });
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
  }, [character, onVisualizerUpdate, stopAllAudio, isRemoteMode, sendRemoteCommand, autoReconnect, wakeWord, onMediaCommand, stopWord, connectionState, enterStandby, exitStandby, isLowLatencyMode, isEcoMode, onToolExecuted]);

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
