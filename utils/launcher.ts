
// Map common app names to URI schemes
// This allows the web app to launch desktop applications via Deep Linking
export const APP_PROTOCOL_MAP: Record<string, string> = {
  // --- WEBSITES (Direct Launch in New Tab) ---
  'youtube': 'https://www.youtube.com',
  'google': 'https://www.google.com',
  'netflix': 'https://www.netflix.com',
  'hulu': 'https://www.hulu.com',
  'prime video': 'https://www.amazon.com/primevideo',
  'twitter': 'https://twitter.com',
  'x': 'https://twitter.com',
  'reddit': 'https://www.reddit.com',
  'instagram': 'https://www.instagram.com',
  'facebook': 'https://www.facebook.com',
  'linkedin': 'https://www.linkedin.com',
  'github': 'https://github.com',
  'chatgpt': 'https://chat.openai.com',
  'claude': 'https://claude.ai',
  'gemini': 'https://gemini.google.com',
  'gmail': 'https://mail.google.com',
  'outlook': 'https://outlook.live.com',
  'wikipedia': 'https://www.wikipedia.org',
  'amazon': 'https://www.amazon.com',
  'twitch': 'https://www.twitch.tv',

  // --- MESSAGING & SOCIAL (Deep Links) ---
  'discord': 'discord://', 
  'slack': 'slack://', 
  'skype': 'skype:', 
  'teams': 'msteams:',
  'whatsapp': 'whatsapp://', 
  'telegram': 'tg://', 
  'messenger': 'fb-messenger://',
  'signal': 'signal://',
  'zoom': 'zoommtg:', 
  
  // --- MEDIA ---
  'spotify': 'spotify:', 
  'itunes': 'music:',
  'apple music': 'music:',
  'steam': 'steam://',
  'vlc': 'vlc://',
  
  // --- PRODUCTIVITY & TOOLS ---
  'vscode': 'vscode://', 
  'code': 'vscode://', 
  'visual studio code': 'vscode://',
  'notion': 'notion://', 
  'figma': 'figma://',
  'trello': 'trello://',
  'obsidian': 'obsidian://',
  'evernote': 'evernote://',
  'sublime': 'subl://',
  
  // --- SYSTEM / UTILITIES (Windows/OS specific) ---
  'calculator': 'calculator:', 
  'mail': 'mailto:',
  'calendar': 'webcal:',
  'maps': 'maps:',
  'settings': 'ms-settings:', // Windows Settings
  'store': 'ms-windows-store:', // Windows Store
  'xbox': 'xbox:',
  'onenote': 'onenote:',
  'terminal': 'wt:', // Windows Terminal
  'camera': 'microsoft.windows.camera:',
  'photos': 'ms-photos:',
  'clock': 'ms-clock:',
  'paint': 'ms-paint:',
  'whiteboard': 'ms-whiteboard:',
  'todo': 'ms-todo:',
  'word': 'ms-word:',
  'excel': 'ms-excel:',
  'powerpoint': 'ms-powerpoint:',
};

export function executeLocalAction(action: string, query: string) {
    try {
        const q = query.trim();
        if (action === 'open_url') {
            let url = q;
            if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
            window.open(url, '_blank');
        } 
        else if (action === 'play_music') {
            if (q.toLowerCase().includes('spotify')) {
                const cleanSong = q.replace(/play|on|spotify/gi, '').trim();
                window.location.assign(`spotify:search:${encodeURIComponent(cleanSong)}`);
            } else {
                window.open(`https://music.youtube.com/search?q=${encodeURIComponent(q)}`, '_blank');
            }
        } 
        else if (action === 'play_video') {
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank');
        } 
        else if (action === 'open_app') {
            const cleanQuery = q.toLowerCase().replace(/^(open|launch|run|check|read|go to)\s+/i, '').trim();
            let target = APP_PROTOCOL_MAP[cleanQuery];
            
            // Fuzzy match for partial names
            if (!target) {
                const key = Object.keys(APP_PROTOCOL_MAP).find(k => cleanQuery.includes(k) || k.includes(cleanQuery));
                if (key) target = APP_PROTOCOL_MAP[key];
            }

            // Domain Heuristic (e.g. "openai.com" sent as app)
            // If the model mistakenly classifies a URL as 'open_app', we handle it here
            if (!target && (cleanQuery.includes('.com') || cleanQuery.includes('.org') || cleanQuery.includes('.net') || cleanQuery.includes('.io'))) {
                target = cleanQuery.startsWith('http') ? cleanQuery : `https://${cleanQuery}`;
            }

            if (target) {
                // Critical: location.assign is needed for Protocol Handlers to work without user interaction on some browsers
                // If it's a website mapping (like youtube), open in new tab
                if (target.startsWith('http')) window.open(target, '_blank');
                else window.location.assign(target);
            } else {
                // Fallback to Google Search if app not found
                window.open(`https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`, '_blank');
            }
        } 
        else if (action === 'media_control') {
            let key = 'MediaPlayPause';
            if (q === 'next') key = 'MediaTrackNext';
            else if (q === 'previous') key = 'MediaTrackPrevious';
            else if (q === 'stop') key = 'MediaStop';
            else if (q === 'seek_forward') key = 'ArrowRight'; 
            else if (q === 'seek_backward') key = 'ArrowLeft'; 
            document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
        }
    } catch(e) {
        console.error("Local action execution failed", e);
    }
}
