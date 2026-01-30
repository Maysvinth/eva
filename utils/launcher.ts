
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

// Helper to open URLs in a new tab reliably using anchor click simulation
// This bypasses some strict window.open() policies and ensures target="_blank"
function openInNewTab(url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        if (document.body.contains(a)) {
            document.body.removeChild(a);
        }
    }, 100);
}

// Helper function to launch protocols without navigating the main window (which would kill the AI connection)
function launchCustomProtocol(url: string) {
    // Attempt 1: Hidden Iframe (Cleanest for apps)
    // This technique allows the browser to trigger the external URI scheme handler
    // WITHOUT unloading the current page or navigating away.
    try {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        
        // Clean up the iframe after a short delay to allow the handler to trigger
        setTimeout(() => {
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
            // Attempt to bring focus back to the window if the OS allows it
            // This is "best effort" as OS level focus stealing is restricted
            try { window.focus(); } catch (e) {}
        }, 1000);
    } catch (e) {
        console.error("Protocol launch failed", e);
    }
}

export function executeLocalAction(action: string, query: string) {
    try {
        const q = query.trim();
        if (action === 'open_url') {
            let url = q;
            if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
            // Websites must open in a new tab to preserve the AI session
            openInNewTab(url);
        } 
        else if (action === 'play_music') {
            if (q.toLowerCase().includes('spotify')) {
                const cleanSong = q.replace(/play|on|spotify/gi, '').trim();
                // Use safe launch to prevent app reload
                launchCustomProtocol(`spotify:search:${encodeURIComponent(cleanSong)}`);
            } else {
                openInNewTab(`https://music.youtube.com/search?q=${encodeURIComponent(q)}`);
            }
        } 
        else if (action === 'play_video') {
            openInNewTab(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);
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
            if (!target && (cleanQuery.includes('.com') || cleanQuery.includes('.org') || cleanQuery.includes('.net') || cleanQuery.includes('.io'))) {
                target = cleanQuery.startsWith('http') ? cleanQuery : `https://${cleanQuery}`;
            }

            if (target) {
                // If it's a website, open in new tab
                if (target.startsWith('http')) {
                    openInNewTab(target);
                } else {
                    // CRITICAL: Custom protocols (apps) use the iframe method.
                    // This ensures the React app does NOT unload, refresh, or stop.
                    // The WebSocket connection remains active.
                    launchCustomProtocol(target);
                }
            } else {
                // Fallback to Google Search if app not found
                openInNewTab(`https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`);
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
