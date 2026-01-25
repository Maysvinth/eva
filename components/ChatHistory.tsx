import React, { useEffect, useRef } from 'react';
import { Message } from '../types';

interface ChatHistoryProps {
  messages: Message[];
  // Streaming props removed to enforce non-streaming constraint
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll only when a full message is added
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 relative z-10 scroll-smooth">
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center text-gray-600 italic">
          System Ready. Audio Mode Active.
        </div>
      )}
      
      {/* Committed History Only - No partial rendering */}
      {messages.map((msg) => (
        <div 
          key={msg.id} 
          className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
        >
          <div className={`max-w-[80%] rounded-lg p-3 shadow-lg ${
            msg.role === 'user' 
              ? 'bg-gray-800 border border-gray-700 text-gray-200' 
              : 'bg-black/50 border border-gray-800 text-cyan-400 backdrop-blur-sm'
          }`}>
             <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
             <span className="text-[10px] opacity-50 block mt-1 font-mono uppercase">
               {msg.timestamp.toLocaleTimeString()}
             </span>
          </div>

          {/* Sources Display */}
          {msg.sources && msg.sources.length > 0 && (
            <div className={`max-w-[80%] mt-2 flex flex-wrap gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.sources.map((source, idx) => (
                    <a 
                        key={idx} 
                        href={source.uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[10px] bg-black/40 hover:bg-black/60 border border-gray-700 rounded px-2 py-1 text-cyan-500 truncate max-w-[200px] block transition-colors flex items-center"
                    >
                        <span className="mr-1">🔗</span> {source.title || new URL(source.uri).hostname}
                    </a>
                ))}
            </div>
          )}
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
};