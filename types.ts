
export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
  sources?: { title: string; uri: string }[];
}

export type VoiceName = 
  // Originals
  'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' | 'Aoede' | 'Leda' | 'Lynx' | 'Orion' | 'Vega' |
  // New Anime Males
  'Kael' | 'Ryu' | 'Atlas' | 'Neo' | 'Dante' |
  // New Anime Females
  'Luna' | 'Solaris' | 'Nova' | 'Aria' | 'Viper';

export interface CharacterProfile {
  id: string;
  name: string;
  voiceName: VoiceName;
  systemInstruction: string;
  themeColor: string; // Tailwind color class prefix (e.g., 'cyan', 'red', 'amber')
  visualizerColor: string; // Hex code for canvas
}

export interface VoiceOption {
  name: VoiceName;
  gender: 'Male' | 'Female';
  description: string;
  themeColor: string; // Tailwind color name
  hexColor: string; // Hex code for visualizer
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface AudioVisualizerState {
  volume: number;
}

// P2P Types
export type DeviceRole = 'host' | 'remote' | 'standalone';

export interface RemoteCommandPacket {
  type: 'COMMAND';
  payload: {
    action: 'open_url' | 'play_music' | 'play_video' | 'open_app' | 'media_control';
    query: string;
  };
}
