import { useState, useRef, useCallback } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { DeviceRole, RemoteCommandPacket } from '../types';
import { executeLocalAction } from '../utils/launcher';

function generateShortId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

interface UseDevicePairingProps {
  onCommandReceived?: (action: string, query: string) => void;
}

export const useDevicePairing = ({ onCommandReceived }: UseDevicePairingProps = {}) => {
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
           
           if (onCommandReceived) {
               onCommandReceived(action, query);
           }
           
           // Execute the command locally on this host device
           executeLocalAction(action, query);
        }
      });

      conn.on('close', () => {
        setConnectionStatus('disconnected');
        connRef.current = null;
      });
    });
  }, [onCommandReceived]);

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
