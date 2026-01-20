import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { pcmToGeminiBlob, base64ToUint8Array, decodeAudioData, downsampleTo16k } from '../utils/audio';
import { CharacterProfile, ConnectionState, Message } from '../types';

// Supported Voices Map: STRICT mapping to only the 5 guaranteed voices to avoid "Invalid Argument"
const SAFE_VOICE_MAP: Record<string, string> = {
  // Male mappings (Original)
  'Puck': 'Puck',
  'Charon': 'Charon',
  'Fenrir': 'Fenrir',
  'Lynx': 'Fenrir',   // Mapped
  'Orion': 'Charon',  // Mapped
  
  // Male mappings (Anime)
  'Kael': 'Fenrir',   // Edgy -> Fenrir
  'Ryu': 'Puck',      // Heroic -> Puck
  'Atlas': 'Charon',  // Heavy -> Charon
  'Neo': 'Puck',      // Tech -> Puck (faster)
  'Dante': 'Fenrir',  // Stylish -> Fenrir

  // Female mappings (Original)
  'Kore': 'Kore',
  'Zephyr': 'Zephyr',
  'Aoede': 'Zephyr',  // Mapped (Aoede sometimes causes issues in Live preview)
  'Leda': 'Kore',     // Mapped
  'Vega': 'Zephyr',   // Mapped

  // Female mappings (Anime)
  'Luna': 'Zephyr',   // Soft -> Zephyr
  'Solaris': 'Kore',  // Energetic -> Kore
  'Nova': 'Zephyr',   // Robotic -> Zephyr
  'Aria': 'Zephyr',   // Noble -> Zephyr
  'Viper': 'Kore',    // Sharp -> Kore
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
  
  const stopAllAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
  }, []);

  const disconnect = useCallback(async () => {
    // 1. Immediately flag as disconnected to stop audio processing loops
    isConnectedRef.current = false;
    
    // Clear any pending reconnects
    if (autoReconnectTimerRef.current) {
        clearTimeout(autoReconnectTimerRef.current);
        autoReconnectTimerRef.current = null;
    }

    // 2. Close session
    if (currentSessionRef.current) {
        try { currentSessionRef.current.close(); } catch (e) {}
        currentSessionRef.current = null;
    }

    stopAllAudio();
    activeConnectionParamsRef.current = null;
    
    // 3. Stop Media Tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // 4. Disconnect Processor explicitly
    if (processorNodeRef.current) {
      try { processorNodeRef.current.disconnect(); } catch(e) {}
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch(e) {}
      sourceNodeRef.current = null;
    }
    
    // 5. Close Audio Contexts
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
      try { await inputContextRef.current.close(); } catch(e) {}
      inputContextRef.current = null;
    }
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') {
      try { await outputContextRef.current.close(); } catch(e) {}
      outputContextRef.current = null;
    }
    
    setConnectionState('disconnected');
    nextStartTimeRef.current = 0;
    setStreamingUserText("");
    setStreamingModelText("");
  }, [stopAllAudio]);

  const connect = useCallback(async () => {
    // Prevent double-connect
    if (isConnectedRef.current || connectionState === 'connecting') return;

    // Clear any pending reconnect timers
    if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);

    try {
      if (!process.env.API_KEY) throw new Error("API Key missing.");

      setConnectionState('connecting');
      setError(null);
      activeConnectionParamsRef.current = { id: character.id, voiceName: character.voiceName, wakeWord: wakeWord, stopWord: stopWord };

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

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // Wake Word Logic in System Instruction
      const wakeWordInstruction = wakeWord && wakeWord.trim().length > 0 
        ? `\n\n*** WAKE WORD PROTOCOL ACTIVATED ***
           The user has set a custom wake word: "${wakeWord}".
           1. Upon connection, you are in STANDBY MODE. Listen silently.
           2. Do NOT respond to any audio input unless you clearly hear the phrase "${wakeWord}" (or a close variation) or if the user is directly addressing you by name.
           3. Once you hear the wake word, respond normally and engage in conversation.
           4. If there is a long pause, revert to listening for the wake word.`
        : "";

      // Stop Word Logic
      const stopWordInstruction = stopWord && stopWord.trim().length > 0
        ? `\n\n*** INTERRUPTION PROTOCOL ***
           If you hear the user say "${stopWord}" (or a close variation), STOP speaking immediately. It is an emergency stop command.`
        : "";

      // Updated System Instruction (Removed mention of googleSearch tool usage to avoid confusion in model)
      const baseInstruction = isRemoteMode 
        ? `You are a REMOTE CONTROLLER. 
           1. Answer general Qs verbally. 
           2. Use 'executeRemoteAction' for websites/apps/music/video.
           3. Use 'controlMedia' for play/pause/stop/next/previous.${wakeWordInstruction}${stopWordInstruction}`
        : `You are a helpful AI. 
           1. Use 'executeRemoteAction' for websites/apps.
           2. Use 'controlMedia' for play/pause/stop/next/previous.
           3. You possess encyclopedic knowledge of Anime, Manga, and Video Games.${wakeWordInstruction}${stopWordInstruction}`;
      
      const finalSystemInstruction = `${baseInstruction} Voice: ${character.voiceName}. ${character.systemInstruction}`;

      // Strictly map voice to supported list
      const safeVoice = SAFE_VOICE_MAP[character.voiceName] || 'Puck';

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } },
          },
          systemInstruction: finalSystemInstruction,
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
          tools: [
              // NOTE: Native GoogleSearch CANNOT be mixed with other tools in current API version.
              // Prioritizing Function Calling for Device Control features.
              { functionDeclarations: [timeTool, laptopControlTool, mediaControlTool] }
          ]
        }
      };

      let currentModelTextBuffer = "";
      let currentUserTextBuffer = "";
      let currentSources: { title: string; uri: string }[] = [];

      const sessionPromise = ai.live.connect({
        model: config.model,
        config: config.config,
        callbacks: {
          onopen: () => {
            setConnectionState('connected');
            isConnectedRef.current = true;
            nextStartTimeRef.current = audioCtxOutput.currentTime;
            
            const source = audioCtxInput.createMediaStreamSource(stream);
            // OPTIMIZATION: Reduced buffer size from 2048 to 512 for lower latency (faster input)
            const processor = audioCtxInput.createScriptProcessor(512, 1, 1);
            
            sourceNodeRef.current = source;
            processorNodeRef.current = processor;

            processor.onaudioprocess = (e) => {
              // Critical check to prevent processing if intentionally disconnected
              if (!isConnectedRef.current) return;

              const inputData = e.inputBuffer.getChannelData(0);
              
              let sum = 0;
              for(let i=0; i<inputData.length; i+=20) sum += Math.abs(inputData[i]); 
              onVisualizerUpdate((sum / (inputData.length/20)) * 3); 

              const downsampledData = downsampleTo16k(inputData, audioCtxInput.sampleRate);
              const blob = pcmToGeminiBlob(downsampledData, 16000);
              
              sessionPromise.then(session => {
                  if (isConnectedRef.current) {
                      try {
                          session.sendRealtimeInput({ media: blob });
                      } catch (err) {
                          // Prevent infinite error loops if socket dies unexpectedly
                          // console.warn("Realtime Input Send Failed - Closing Loop", err); 
                          // Don't close immediately on one fail, but stop loop if widespread
                          if (String(err).includes("CLOSING") || String(err).includes("CLOSED")) {
                              isConnectedRef.current = false;
                          }
                      }
                  }
              }).catch(err => {
                  // console.debug("Session promise error during audio streaming", err);
              });
            };

            source.connect(processor);
            processor.connect(audioCtxInput.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const { serverContent } = msg;

            if (serverContent?.interrupted) {
                stopAllAudio();
                if (outputContextRef.current) nextStartTimeRef.current = outputContextRef.current.currentTime;
                currentModelTextBuffer = "";
                setStreamingModelText("");
                currentSources = [];
                return; 
            }

            // Client-side Stop Word Detection (Instant Interrupt)
            if (stopWord && stopWord.length > 0 && serverContent?.inputTranscription?.text) {
                const text = serverContent.inputTranscription.text.toLowerCase();
                const target = stopWord.toLowerCase();
                if (text.includes(target)) {
                    // Force interruption locally
                    stopAllAudio();
                    if (outputContextRef.current) nextStartTimeRef.current = outputContextRef.current.currentTime;
                }
            }

            if (serverContent?.inputTranscription?.text) {
              currentUserTextBuffer += serverContent.inputTranscription.text;
              setStreamingUserText(currentUserTextBuffer);
            }

            if (serverContent?.outputTranscription?.text) {
              currentModelTextBuffer += serverContent.outputTranscription.text;
              setStreamingModelText(currentModelTextBuffer);
            }

            if (serverContent?.turnComplete) {
              if (currentUserTextBuffer.trim()) {
                setMessages(prev => [...prev, {
                  id: 'user-' + Date.now(),
                  role: 'user',
                  text: currentUserTextBuffer.trim(),
                  timestamp: new Date()
                }]);
                currentUserTextBuffer = "";
                setStreamingUserText("");
              }

              if (currentModelTextBuffer.trim()) {
                setMessages(prev => [...prev, {
                  id: 'model-' + Date.now(),
                  role: 'model',
                  text: currentModelTextBuffer.trim(),
                  timestamp: new Date(),
                  sources: currentSources.length > 0 ? [...currentSources] : undefined
                }]);
                currentModelTextBuffer = "";
                setStreamingModelText("");
                currentSources = [];
              }
            }

            const audioData = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputContextRef.current) {
               const audioBuffer = await decodeAudioData(
                 base64ToUint8Array(audioData),
                 outputContextRef.current,
                 24000
               );
               
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
               if (nextStartTimeRef.current < currentTime) {
                 nextStartTimeRef.current = currentTime;
               }
               
               source.start(nextStartTimeRef.current);
               nextStartTimeRef.current += audioBuffer.duration;
            }
            
            if (msg.toolCall) {
                for (const fc of msg.toolCall.functionCalls) {
                    let result: any = {};
                    
                    if (fc.name === 'getCurrentTime') {
                        result = { currentTime: new Date().toLocaleTimeString() };
                    } 
                    else if (fc.name === 'controlMedia') {
                        const args = fc.args as any;
                        if (args.command === 'pause' || args.command === 'stop') stopAllAudio();
                        
                        // Notify UI State
                        if (onMediaCommand) onMediaCommand(args.command);

                        if (isRemoteMode) {
                            sendRemoteCommand('media_control', args.command);
                            result = { status: 'sent', command: args.command };
                        } else {
                             // Use standard keys for seek
                             let key = 'MediaPlayPause';
                             if (args.command === 'next') key = 'MediaTrackNext';
                             if (args.command === 'previous') key = 'MediaTrackPrevious';
                             if (args.command === 'stop') key = 'MediaStop';
                             if (args.command === 'seek_forward') key = 'ArrowRight'; 
                             if (args.command === 'seek_backward') key = 'ArrowLeft'; 

                             try { document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true })); } catch(e) {}
                             result = { status: 'executed', command: args.command };
                        }
                    } 
                    else if (fc.name === 'executeRemoteAction') {
                        const args = fc.args as any;
                        if (isRemoteMode) {
                            sendRemoteCommand(args.action, args.query);
                            result = { status: 'sent' };
                        } else {
                            setTimeout(() => {
                                if (args.action === 'open_url') window.open(args.query.startsWith('http') ? args.query : 'https://'+args.query, '_blank');
                                else if (args.action === 'play_music') window.open(`https://music.youtube.com/search?q=${encodeURIComponent(args.query)}`, '_blank');
                                else if (args.action === 'play_video') window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`, '_blank');
                                else if (args.action === 'open_app') window.open(`https://www.google.com/search?q=${encodeURIComponent(args.query)}`, '_blank');
                            }, 50);
                            result = { status: 'executed' };
                        }
                    } 

                    sessionPromise.then(session => session.sendToolResponse({
                        functionResponses: { id: fc.id, name: fc.name, response: result }
                    }));
                }
            }
          },
          onclose: (e) => {
            console.log("Session Closed", e);
            setConnectionState('disconnected');
            isConnectedRef.current = false;
            activeConnectionParamsRef.current = null;
            currentSessionRef.current = null;

            if (autoReconnect && !error?.includes("Permission") && !isReconnectingRef.current) {
                console.log("Auto-reconnecting in 2s...");
                autoReconnectTimerRef.current = setTimeout(() => {
                    connect();
                }, 2000);
            }
          },
          onerror: (err: any) => {
            console.error("Gemini API Error:", err);
            
            let errorMessage = "Unknown Error";
            if (err instanceof Error) errorMessage = err.message;
            else if (typeof err === 'object') errorMessage = JSON.stringify(err);
            else errorMessage = String(err);
            
            if (errorMessage.includes("Network error") || errorMessage.includes("Failed to fetch")) {
                return; 
            }
            
            if (errorMessage === "{}" || errorMessage.includes("[object ErrorEvent]")) {
                errorMessage = "Connection Failed (Network or Firewall)";
            }

            if (errorMessage.includes("403") || errorMessage.includes("permission") || errorMessage.includes("Permission")) {
               setError("Permission Denied: Check API Key.");
            } else if (errorMessage.includes("invalid argument")) {
               setError("Invalid Argument: Re-initializing configuration...");
            } else if (errorMessage.includes("implemented") || errorMessage.includes("supported")) {
               setError("Feature Not Supported: Retrying with simplified config...");
            } else {
               setError("Connection Error: " + errorMessage);
            }
            
            setConnectionState('error');
            isConnectedRef.current = false;
            activeConnectionParamsRef.current = null;
            currentSessionRef.current = null;

            if (autoReconnect && !errorMessage.includes("Permission") && !errorMessage.includes("403")) {
                autoReconnectTimerRef.current = setTimeout(() => {
                    connect();
                }, 2000);
            }
          }
        }
      });
      
      sessionPromise.then(session => {
        if (!isConnectedRef.current) {
            session.close();
        } else {
            currentSessionRef.current = session;
        }
      });

    } catch (e: any) {
      console.error(e);
      setError(e.message);
      setConnectionState('error');
      isReconnectingRef.current = false;
    }
  }, [character, onVisualizerUpdate, stopAllAudio, isRemoteMode, sendRemoteCommand, autoReconnect, wakeWord, onMediaCommand, stopWord, connectionState]); 

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

  return { connect, disconnect, connectionState, messages, streamingUserText, streamingModelText, error };
};