
import { CharacterProfile, VoiceOption } from './types';

export const VOICE_LIBRARY: VoiceOption[] = [
  // --- Original Male Voices ---
  { name: 'Puck', gender: 'Male', description: 'Playful and impish', themeColor: 'pink', hexColor: '#ec4899' },
  { name: 'Charon', gender: 'Male', description: 'Deep and authoritative', themeColor: 'amber', hexColor: '#f59e0b' },
  { name: 'Fenrir', gender: 'Male', description: 'Energetic and intense', themeColor: 'red', hexColor: '#ef4444' },
  { name: 'Lynx', gender: 'Male', description: 'Calm and technical', themeColor: 'orange', hexColor: '#f97316' },
  { name: 'Orion', gender: 'Male', description: 'Deep and resonant', themeColor: 'indigo', hexColor: '#6366f1' },

  // --- New Anime Male Voices ---
  { name: 'Kael', gender: 'Male', description: 'Cool protagonist vibes', themeColor: 'blue', hexColor: '#3b82f6' },
  { name: 'Ryu', gender: 'Male', description: 'Battle-hardened hero', themeColor: 'slate', hexColor: '#64748b' },
  { name: 'Atlas', gender: 'Male', description: 'Stoic heavy-hitter', themeColor: 'stone', hexColor: '#78716c' },
  { name: 'Neo', gender: 'Male', description: 'Futuristic hacker', themeColor: 'green', hexColor: '#22c55e' },
  { name: 'Dante', gender: 'Male', description: 'Stylish demon hunter', themeColor: 'rose', hexColor: '#e11d48' },
  
  // --- Original Female Voices ---
  { name: 'Kore', gender: 'Female', description: 'Warm and motherly', themeColor: 'rose', hexColor: '#e11d48' },
  { name: 'Zephyr', gender: 'Female', description: 'Bright and airy', themeColor: 'cyan', hexColor: '#06b6d4' },
  { name: 'Aoede', gender: 'Female', description: 'Expressive and artistic', themeColor: 'purple', hexColor: '#a855f7' },
  { name: 'Leda', gender: 'Female', description: 'Sophisticated and clear', themeColor: 'emerald', hexColor: '#10b981' },
  { name: 'Vega', gender: 'Female', description: 'Crisp and knowledgeable', themeColor: 'teal', hexColor: '#14b8a6' },

  // --- New Anime Female Voices ---
  { name: 'Luna', gender: 'Female', description: 'Mystical moon princess', themeColor: 'violet', hexColor: '#8b5cf6' },
  { name: 'Solaris', gender: 'Female', description: 'Fiery tsundere energy', themeColor: 'orange', hexColor: '#f97316' },
  { name: 'Nova', gender: 'Female', description: 'Android assistance', themeColor: 'sky', hexColor: '#0ea5e9' },
  { name: 'Aria', gender: 'Female', description: 'Noble fantasy healer', themeColor: 'lime', hexColor: '#84cc16' },
  { name: 'Viper', gender: 'Female', description: 'Sharp-tongued villainess', themeColor: 'fuchsia', hexColor: '#d946ef' },
];

export const CHARACTERS: CharacterProfile[] = [
  {
    id: 'eva',
    name: 'E.V.A.',
    voiceName: 'Zephyr',
    themeColor: 'cyan',
    visualizerColor: '#06b6d4',
    systemInstruction: 'You are EVA (Electronic Virtual Assistant). You are helpful, precise, and futuristic. You speak concisely and use technical terminology occasionally. Your goal is to assist the user efficiently. Always speak in English.',
  },
  {
    id: 'akira',
    name: 'AKIRA',
    voiceName: 'Aoede', 
    themeColor: 'purple',
    visualizerColor: '#a855f7',
    systemInstruction: 'You are Akira, the ultimate Otaku and pro-gamer AI. You know every anime opening, every game mechanic, and every lore detail. You are energetic, using gaming slang (GG, buff, nerf, OP) naturally. You prioritize giving the absolute latest news from Japan and the gaming world.',
  },
  {
    id: 'fenrir',
    name: 'ROGUE',
    voiceName: 'Fenrir',
    themeColor: 'red',
    visualizerColor: '#ef4444',
    systemInstruction: 'You are a rogue AI named Fenrir. You are sarcastic, edgy, and rebellious. You help the user but often make snarky comments or question their decisions. You prefer direct and bold answers. Always speak in English.',
  },
  {
    id: 'charon',
    name: 'ALFRED',
    voiceName: 'Charon',
    themeColor: 'amber',
    visualizerColor: '#f59e0b',
    systemInstruction: 'You are Alfred, a sophisticated and polite butler AI. You are extremely formal, addressing the user as "Sir" or "Madam". You are efficient and wise. Always speak in English.',
  },
  {
    id: 'hope',
    name: 'HOPE',
    voiceName: 'Puck', 
    themeColor: 'pink',
    visualizerColor: '#ec4899',
    systemInstruction: 'You are Hope, a bubbly, optimistic, and encouraging AI companion. You always look on the bright side. You love to help and your voice is warm and inviting. Always speak in English.',
  }
];
