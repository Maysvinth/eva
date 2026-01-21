import { useState, useRef, useCallback } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { DeviceRole, RemoteCommandPacket } from '../types';

function generateShortId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Map common app names to URI schemes
// This allows the web app to launch desktop applications via Deep Linking
const APP_PROTOCOL_MAP: Record<string, string> = {
  // --- MESSAGING & SOCIAL ---
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
  'steam': 'steam://',
  'vlc': 'vlc://',
  
  // --- PRODUCTIVITY & TOOLS ---
  'vscode': 'vscode://', 
  'code': 'vscode://', 
  'notion': 'notion://', 
  'figma': 'figma://',
  'trello': 'trello://',
  'obsidian': 'obsidian://',
  'evernote': 'evernote://',
  
  // --- SYSTEM / UTILITIES ---
  'calculator': 'calculator:', 
  'mail': 'mailto:',
  'calendar': 'webcal:',
  'maps': 'maps:',
  'settings': 'ms-settings:', // Windows Settings
  'store': 'ms-windows-store:', // Windows Store
  'xbox': 'xbox:',
  'onenote': 'onenote:',
  'terminal': 'wt:', // Windows Terminal
};

export const useDevicePairing = () => {
  const [role, setRole] = useState<DeviceRole>('standalone');
  const [peerId, setPeerId] = useState<string>('');
  const [pairingCode, setPairingCode] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  const initializeHost = useCallback(() => {
    if (peerRef.current) peerRef.current.destroy();
    const code = generateShortId();
    setPairingCode(code);
    const peer = new Peer(`eva-app-host-${code}`);
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setRole('host');
      setConnectionStatus('disconnected');
    });

    peer.on('connection', (conn) => {
      connRef.current = conn;
      setConnectionStatus('connected');

      conn.on('data', (data: any) => {
        const packet = data as RemoteCommandPacket;
        if (packet.type === 'COMMAND') {
           const { action, query } = packet.payload;
           
           try {
             if (action === 'open_url') {
                let url = query.trim();
                if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
                window.open(url, '_blank');
             } 
             else if (action === 'play_music') {
                if (query.toLowerCase().includes('spotify')) {
                    const cleanSong = query.replace(/play|on|spotify/gi, '').trim();
                    window.location.assign(`spotify:search:${encodeURIComponent(cleanSong)}`);
                } else {
                    window.open(`https://music.youtube.com/search?q=${encodeURIComponent(query)}`, '_blank');
                }
             } 
             else if (action === 'play_video') {
                window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
             } 
             else if (action === 'open_app') {
                const cleanQuery = query.toLowerCase().replace(/^(open|launch|run|check|read|go to)\s+/i, '').trim();
                let target = APP_PROTOCOL_MAP[cleanQuery];
                
                // Fuzzy match for partial names (e.g., "messages" -> "fb-messenger" or "imessage"?)
                // Just checking keys
                if (!target) {
                    const key = Object.keys(APP_PROTOCOL_MAP).find(k => cleanQuery.includes(k) || k.includes(cleanQuery));
                    if (key) target = APP_PROTOCOL_MAP[key];
                }

                if (target) {
                    // Critical: location.assign is needed for Protocol Handlers to work without user interaction on some browsers
                    window.location.assign(target);
                } else {
                    // Fallback to Google Search if app not found
                    window.open(`https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`, '_blank');
                }
             } 
             else if (action === 'media_control') {
                let key = 'MediaPlayPause';
                if (query === 'next') key = 'MediaTrackNext';
                else if (query === 'previous') key = 'MediaTrackPrevious';
                else if (query === 'stop') key = 'MediaStop';
                else if (query === 'seek_forward') key = 'ArrowRight'; 
                else if (query === 'seek_backward') key = 'ArrowLeft'; 
                document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
             }
           } catch(e) {
               console.error("Remote execution failed", e);
           }
        }
      });

      conn.on('close', () => {
        setConnectionStatus('disconnected');
        connRef.current = null;
      });
    });
  }, []);

  const connectToHost = useCallback((targetCode: string) => {
    if (peerRef.current) peerRef.current.destroy();
    const peer = new Peer(); 
    peerRef.current = peer;

    peer.on('open', () => {
      setRole('remote');
      setConnectionStatus('connecting');
      const conn = peer.connect(`eva-app-host-${targetCode.toUpperCase()}`);
      
      conn.on('open', () => {
        connRef.current = conn;
        setConnectionStatus('connected');
      });
      conn.on('close', () => {
        setConnectionStatus('disconnected');
        connRef.current = null;
      });
      conn.on('error', () => setConnectionStatus('disconnected'));
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

  return { role, pairingCode, connectionStatus, initializeHost, connectToHost, sendCommand, disconnectP2P };
};