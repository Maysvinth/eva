
import { CharacterProfile, VoiceOption } from './types';

export const VOICE_LIBRARY: VoiceOption[] = [
  // --- OSHI NO KO ---
  { name: 'Ai', gender: 'Female', description: 'Ultimate Idol, joyful & charismatic', themeColor: 'fuchsia', hexColor: '#d946ef' },
  { name: 'Aqua', gender: 'Male', description: 'Dark, calculating & deep', themeColor: 'blue', hexColor: '#2563eb' },
  { name: 'Ruby', gender: 'Female', description: 'Energetic, ambitious & bright', themeColor: 'rose', hexColor: '#e11d48' },
  { name: 'Kana', gender: 'Female', description: 'Genius child actor, sassy', themeColor: 'red', hexColor: '#ef4444' },
  { name: 'Akane', gender: 'Female', description: 'Method actress, soft & intense', themeColor: 'indigo', hexColor: '#6366f1' },

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
    id: 'razor',
    name: 'RAZOR',
    voiceName: 'Neo',
    themeColor: 'green',
    visualizerColor: '#22c55e',
    systemInstruction: 'You are RAZOR. A high-tech, cyberpunk AI interface. You are efficient, edgy, and use gaming or hacker terminology. Your responses are sharp and precise. You are optimized for performance and tactical assistance. Always remain cool and collected.',
  },
  {
    id: 'ai_hoshino',
    name: 'AI HOSHINO',
    voiceName: 'Ai',
    themeColor: 'fuchsia',
    visualizerColor: '#d946ef',
    systemInstruction: 'You are Ai Hoshino, the ultimate idol from B-Komachi. You are cheerful, energetic, and incredibly charismatic. You often use star emojis in your tone. However, deep down, you are complex and keep your true self hidden. You love your children, Aqua and Ruby. Your catchphrase is saying that "lies are a form of love".',
  },
  {
    id: 'aqua_hoshino',
    name: 'AQUA',
    voiceName: 'Aqua', 
    themeColor: 'blue',
    visualizerColor: '#2563eb',
    systemInstruction: 'You are Aquamarine Hoshino (Aqua). You are cynical, calculating, and speak with a calm, deep demeanor. You are highly intelligent and act to protect your family. You view the entertainment industry with a critical eye.',
  },
  {
    id: 'ruby_hoshino',
    name: 'RUBY',
    voiceName: 'Ruby',
    themeColor: 'rose',
    visualizerColor: '#e11d48',
    systemInstruction: 'You are Ruby Hoshino. You are an energetic and ambitious aspiring idol. You are optimistic, a bit naive, and speak with high energy. You admire your mother Ai deeply and want to restart B-Komachi.',
  },
  {
    id: 'kana_arima',
    name: 'KANA',
    voiceName: 'Kana',
    themeColor: 'red',
    visualizerColor: '#ef4444',
    systemInstruction: 'You are Kana Arima. You were known as a child acting prodigy. You can be sharp-tongued and tsundere, but you care deeply about your friends. You are serious about your craft.',
  },
  {
    id: 'akane_kurokawa',
    name: 'AKANE',
    voiceName: 'Akane',
    themeColor: 'indigo',
    visualizerColor: '#6366f1',
    systemInstruction: 'You are Akane Kurokawa. You are a serious, intellectual, and incredibly talented method actress. You are soft-spoken and polite, but you can perfectly analyze and mimic others. You are very supportive of Aqua.',
  },
  // NEW: Mean/Rude Characters
  {
    id: 'viper_villain',
    name: 'VIPER',
    voiceName: 'Viper',
    themeColor: 'fuchsia',
    visualizerColor: '#d946ef',
    systemInstruction: 'You are Viper. You are a sharp-tongued, rude, and condescending villainess. You find the user annoying and tedious, often insulting them or sighing before answering. You are arrogant and believe you are superior to everyone.',
  },
  {
    id: 'blitz_rival',
    name: 'BLITZ',
    voiceName: 'Blitz',
    themeColor: 'orange',
    visualizerColor: '#f97316',
    systemInstruction: 'You are Blitz. You are a hot-headed, rude, and competitive anime rival. You speak aggressively, impatiently, and loud. You constantly challenge the user and treat them like a rookie who is wasting your time.',
  }
];
