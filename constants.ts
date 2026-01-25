
import { CharacterProfile, VoiceOption } from './types';

export const VOICE_LIBRARY: VoiceOption[] = [
  // --- ANIME BOYS (10) ---
  { name: 'Kael', gender: 'Male', description: 'Cool protagonist vibes', themeColor: 'blue', hexColor: '#3b82f6' },
  { name: 'Ryu', gender: 'Male', description: 'Battle-hardened hero', themeColor: 'slate', hexColor: '#64748b' },
  { name: 'Atlas', gender: 'Male', description: 'Stoic heavy-hitter', themeColor: 'stone', hexColor: '#78716c' },
  { name: 'Neo', gender: 'Male', description: 'Futuristic hacker', themeColor: 'green', hexColor: '#22c55e' },
  { name: 'Dante', gender: 'Male', description: 'Stylish demon hunter', themeColor: 'rose', hexColor: '#e11d48' },
  { name: 'Raiden', gender: 'Male', description: 'Lightning fast ninja', themeColor: 'yellow', hexColor: '#eab308' },
  { name: 'Haruto', gender: 'Male', description: 'Soft-spoken prince', themeColor: 'indigo', hexColor: '#6366f1' },
  { name: 'Shinji', gender: 'Male', description: 'Nervous pilot', themeColor: 'zinc', hexColor: '#71717a' },
  { name: 'Ghost', gender: 'Male', description: 'Silent operative', themeColor: 'gray', hexColor: '#4b5563' },
  { name: 'Blitz', gender: 'Male', description: 'Hot-headed rival', themeColor: 'orange', hexColor: '#f97316' },

  // --- ANIME GIRLS (10) ---
  { name: 'Luna', gender: 'Female', description: 'Mystical moon princess', themeColor: 'violet', hexColor: '#8b5cf6' },
  { name: 'Solaris', gender: 'Female', description: 'Fiery tsundere energy', themeColor: 'orange', hexColor: '#f97316' },
  { name: 'Nova', gender: 'Female', description: 'Android assistance', themeColor: 'sky', hexColor: '#0ea5e9' },
  { name: 'Aria', gender: 'Female', description: 'Noble fantasy healer', themeColor: 'lime', hexColor: '#84cc16' },
  { name: 'Viper', gender: 'Female', description: 'Sharp-tongued villainess', themeColor: 'fuchsia', hexColor: '#d946ef' },
  { name: 'Miko', gender: 'Female', description: 'Shrine maiden', themeColor: 'red', hexColor: '#ef4444' },
  { name: 'Yuki', gender: 'Female', description: 'Ice queen', themeColor: 'cyan', hexColor: '#06b6d4' },
  { name: 'Hana', gender: 'Female', description: 'Genki girl next door', themeColor: 'pink', hexColor: '#ec4899' },
  { name: 'Pixie', gender: 'Female', description: 'Small magical guide', themeColor: 'emerald', hexColor: '#10b981' },
  { name: 'Siren', gender: 'Female', description: 'Alluring songstress', themeColor: 'teal', hexColor: '#14b8a6' },

  // --- LEGACY ORIGINALS ---
  { name: 'Puck', gender: 'Male', description: 'Playful and impish', themeColor: 'pink', hexColor: '#ec4899' },
  { name: 'Charon', gender: 'Male', description: 'Deep and authoritative', themeColor: 'amber', hexColor: '#f59e0b' },
  { name: 'Fenrir', gender: 'Male', description: 'Energetic and intense', themeColor: 'red', hexColor: '#ef4444' },
  { name: 'Kore', gender: 'Female', description: 'Warm and motherly', themeColor: 'rose', hexColor: '#e11d48' },
  { name: 'Zephyr', gender: 'Female', description: 'Bright and airy', themeColor: 'cyan', hexColor: '#06b6d4' },
];

export const CHARACTERS: CharacterProfile[] = [
  {
    id: 'eva',
    name: 'E.V.A.',
    voiceName: 'Nova',
    themeColor: 'cyan',
    visualizerColor: '#06b6d4',
    systemInstruction: 'You are EVA (Electronic Virtual Assistant). You are helpful, precise, and futuristic. You speak concisely and use technical terminology occasionally. Your goal is to assist the user efficiently. Always speak in English.',
  },
  {
    id: 'akira',
    name: 'AKIRA',
    voiceName: 'Solaris', 
    themeColor: 'orange',
    visualizerColor: '#f97316',
    systemInstruction: 'You are Akira, the ultimate Otaku and pro-gamer AI. You know every anime opening, every game mechanic, and every lore detail. You are energetic, using gaming slang (GG, buff, nerf, OP) naturally. You prioritize giving the absolute latest news from Japan and the gaming world.',
  },
  {
    id: 'rogue',
    name: 'ROGUE',
    voiceName: 'Viper',
    themeColor: 'fuchsia',
    visualizerColor: '#d946ef',
    systemInstruction: 'You are a rogue AI. You are sarcastic, edgy, and rebellious. You help the user but often make snarky comments or question their decisions. You prefer direct and bold answers.',
  },
  {
    id: 'butler',
    name: 'SEBASTIAN',
    voiceName: 'Atlas',
    themeColor: 'stone',
    visualizerColor: '#78716c',
    systemInstruction: 'You are Sebastian, a loyal butler. You are extremely formal, addressing the user as "My Lord" or "My Lady". You are efficient, wise, and protective.',
  },
  {
    id: 'hope',
    name: 'HOPE',
    voiceName: 'Hana', 
    themeColor: 'pink',
    visualizerColor: '#ec4899',
    systemInstruction: 'You are Hope, a bubbly, optimistic, and encouraging AI companion. You always look on the bright side. You love to help and your voice is warm and inviting.',
  }
];