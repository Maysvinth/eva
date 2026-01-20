import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { DeviceRole, RemoteCommandPacket } from '../types';

function generateShortId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Map common app names to URI schemes or Web Fallbacks
const APP_PROTOCOL_MAP: Record<string, string> = {
  // --- COMMUNICATION & SOCIAL ---
  'discord': 'discord://',
  'slack': 'slack://',
  'skype': 'skype:',
  'teams': 'msteams:',
  'telegram': 'tg://',
  'whatsapp': 'whatsapp://',
  'messenger': 'messenger://',
  'zoom': 'zoommtg:',
  'signal': 'signal://',
  'line': 'line://',
  'wechat': 'weixin://',
  'viber': 'viber://',
  'twitter': 'https://twitter.com',
  'x': 'https://x.com',
  'instagram': 'https://instagram.com',
  'facebook': 'https://facebook.com',
  'linkedin': 'https://linkedin.com',
  'reddit': 'https://reddit.com',
  'tiktok': 'https://tiktok.com',
  'pinterest': 'https://pinterest.com',
  'snapchat': 'https://snapchat.com',
  'tumblr': 'https://tumblr.com',

  // --- MEDIA & ENTERTAINMENT ---
  'spotify': 'spotify:',
  'itunes': 'itms:',
  'apple music': 'music:',
  'music': 'music:', 
  'steam': 'steam://',
  'epic': 'com.epicgames.launcher://',
  'twitch': 'twitch://',
  'vlc': 'vlc://',
  'netflix': 'https://netflix.com',
  'youtube': 'https://youtube.com',
  'hulu': 'https://hulu.com',
  'prime video': 'https://amazon.com/video',
  'disney': 'https://disneyplus.com',
  'disney+': 'https://disneyplus.com',
  'hbomax': 'https://max.com',
  'max': 'https://max.com',
  'crunchyroll': 'https://crunchyroll.com',
  'imdb': 'https://imdb.com',
  
  // --- BROWSERS ---
  'chrome': 'https://google.com',
  'google chrome': 'https://google.com',
  'firefox': 'https://mozilla.org',
  'edge': 'https://microsoft.com/edge',
  'safari': 'https://apple.com/safari',
  'opera': 'https://opera.com',
  'brave': 'https://brave.com',
  'vivaldi': 'https://vivaldi.com',

  // --- DEVELOPMENT & PRODUCTIVITY ---
  'vscode': 'vscode://',
  'visual studio code': 'vscode://',
  'code': 'vscode://',
  'visual studio': 'visualstudio:',
  'intellij': 'idea://',
  'notion': 'notion://',
  'obsidian': 'obsidian://',
  'trello': 'trello://',
  'figma': 'figma://',
  'canva': 'https://canva.com',
  'postman': 'postman://',
  'docker': 'docker://',
  'github': 'https://github.com',
  'gitlab': 'https://gitlab.com',
  'stackoverflow': 'https://stackoverflow.com',
  'chatgpt': 'https://chatgpt.com',
  'claude': 'https://claude.ai',
  'gemini': 'https://gemini.google.com',
  'word': 'https://office.com/launch/word',
  'ms word': 'https://office.com/launch/word',
  'excel': 'https://office.com/launch/excel',
  'ms excel': 'https://office.com/launch/excel',
  'powerpoint': 'https://office.com/launch/powerpoint',
  'ms powerpoint': 'https://office.com/launch/powerpoint',
  'docs': 'https://docs.google.com',
  'sheets': 'https://docs.google.com/spreadsheets',
  'slides': 'https://docs.google.com/presentation',
  'drive': 'https://drive.google.com',
  'onedrive': 'https://onedrive.live.com',
  'dropbox': 'https://dropbox.com',
  'evernote': 'evernote://',

  // --- SYSTEM / MICROSOFT / UTILITIES ---
  'calculator': 'calculator:', 
  'calc': 'calculator:',
  'settings': 'ms-settings:', 
  'store': 'ms-windows-store:',
  'photos': 'ms-photos:',
  'camera': 'microsoft.windows.camera:',
  'mail': 'mailto:',
  'email': 'mailto:',
  'outlook': 'outlookcal:',
  'calendar': 'outlookcal:',
  'maps': 'bingmaps:',
  'google maps': 'https://maps.google.com',
  'clock': 'ms-clock:',
  'alarm': 'ms-clock:',
  'xbox': 'xbox:',
  'terminal': 'wt:',
  'command prompt': 'cmd:',
  'cmd': 'cmd:', 
  'powershell': 'powershell:',
  'paint': 'ms-paint:',
  'notepad': 'notepad:',
  'explorer': 'explorer:',
  'files': 'explorer:',
  'file explorer': 'explorer:',
  'finder': 'file:', // macOS fallback attempt (often restricted)
  'screenshot': 'ms-screenclip:',
  'snip': 'ms-screenclip:',
  'task manager': 'taskmgr:',
  'control panel': 'control:',
  'weather': 'bingweather:',
  'news': 'bingnews:',
};

export const useDevicePairing = () => {
  const [role, setRole] = useState<DeviceRole>('standalone');
  const [peerId, setPeerId] = useState<string>('');
  const [pairingCode, setPairingCode] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [connectedPeerName, setConnectedPeerName] = useState<string>('');
  
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  // Initialize Host (Laptop)
  const initializeHost = useCallback(() => {
    if (peerRef.current) peerRef.current.destroy();

    const code = generateShortId();
    setPairingCode(code);
    const fullId = `eva-app-host-${code}`;

    const peer = new Peer(fullId);
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setRole('host');
      setConnectionStatus('disconnected');
    });

    peer.on('connection', (conn) => {
      connRef.current = conn;
      setConnectionStatus('connected');
      setConnectedPeerName(conn.peer);

      // Handle incoming data
      conn.on('data', (data: any) => {
        const packet = data as RemoteCommandPacket;
        if (packet.type === 'COMMAND') {
           const { action, query } = packet.payload;
           // Execute locally on Host
           if (action === 'open_url') {
                let url = query.trim();
                const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(url);
                if (!hasProtocol) url = 'https://' + url;
                window.open(url, '_blank');
           } else if (action === 'play_music') {
                const lowerQuery = query.toLowerCase();
                // SMART MUSIC HANDLING
                if (lowerQuery.includes('spotify')) {
                    const cleanSong = query.replace(/play|on|spotify/gi, '').trim();
                    window.open(`spotify:search:${encodeURIComponent(cleanSong)}`, '_self');
                } else {
                    window.open(`https://music.youtube.com/search?q=${encodeURIComponent(query)}`, '_blank');
                }
           } else if (action === 'play_video') {
                window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
           } else if (action === 'open_app') {
                const cleanQuery = query.toLowerCase()
                  .replace(/^(open|launch|start|run|play)\s+/i, '')
                  .replace(/^(the|my|a|an)\s+/i, '')
                  .trim();
                
                let target = APP_PROTOCOL_MAP[cleanQuery];
                if (!target) {
                    const firstWord = cleanQuery.split(' ')[0];
                    target = APP_PROTOCOL_MAP[firstWord];
                }
                
                if (target) {
                    const targetFrame = target.startsWith('http') ? '_blank' : '_self';
                    window.open(target, targetFrame);
                } else {
                    if (cleanQuery.includes('.') && !cleanQuery.includes(' ')) {
                        let url = cleanQuery;
                        if (!url.startsWith('http')) url = 'https://' + url;
                        window.open(url, '_blank');
                    } else {
                        window.open(`https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`, '_blank');
                    }
                }
           } else if (action === 'media_control') {
                // Expanded Media Control
                let key = 'MediaPlayPause';
                if (query === 'next') key = 'MediaTrackNext';
                else if (query === 'previous') key = 'MediaTrackPrevious';
                else if (query === 'stop') key = 'MediaStop';
                else if (query === 'seek_forward') key = 'ArrowRight'; // Web Standard
                else if (query === 'seek_backward') key = 'ArrowLeft'; // Web Standard
                
                try {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
                } catch (e) {
                    console.warn("Media control failed", e);
                }
           }
        }
      });

      conn.on('close', () => {
        setConnectionStatus('disconnected');
        connRef.current = null;
      });
    });
  }, []);

  // Initialize Remote (Phone)
  const connectToHost = useCallback((targetCode: string) => {
    if (peerRef.current) peerRef.current.destroy();

    const peer = new Peer(); 
    peerRef.current = peer;

    peer.on('open', (id) => {
      setRole('remote');
      setConnectionStatus('connecting');
      
      const targetId = `eva-app-host-${targetCode.toUpperCase()}`;
      const conn = peer.connect(targetId);
      
      conn.on('open', () => {
        connRef.current = conn;
        setConnectionStatus('connected');
        setConnectedPeerName(targetId);
      });

      conn.on('close', () => {
        setConnectionStatus('disconnected');
        connRef.current = null;
      });
      
      conn.on('error', (err) => {
          console.error("Connection Error", err);
          setConnectionStatus('disconnected');
      });
    });
  }, []);

  const sendCommand = useCallback((action: 'open_url' | 'play_music' | 'play_video' | 'open_app' | 'media_control', query: string) => {
    if (connRef.current && connectionStatus === 'connected') {
        const packet: RemoteCommandPacket = {
            type: 'COMMAND',
            payload: { action, query }
        };
        connRef.current.send(packet);
        return true;
    }
    return false;
  }, [connectionStatus]);

  const disconnectP2P = useCallback(() => {
     if (peerRef.current) peerRef.current.destroy();
     peerRef.current = null;
     connRef.current = null;
     setRole('standalone');
     setConnectionStatus('disconnected');
  }, []);

  return {
    role,
    pairingCode,
    connectionStatus,
    initializeHost,
    connectToHost,
    sendCommand,
    disconnectP2P
  };
};