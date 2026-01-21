import React, { useEffect, useRef } from 'react';
import { Message } from '../types';

interface ChatHistoryProps {
  messages: Message[];
  streamingUserText?: string;
  streamingModelText?: string;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, streamingUserText, streamingModelText }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when messages or streaming text updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingUserText, streamingModelText]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 relative z-10 scroll-smooth">
      {messages.length === 0 && !streamingUserText && !streamingModelText && (
        <div className="h-full flex items-center justify-center text-gray-600 italic">
          System Initialized. Awaiting Input...
        </div>
      )}
      
      {/* Committed History */}
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

          {/* Sources Display for News/Facts */}
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

      {/* Real-time Streaming User Input */}
      {streamingUserText && (
        <div className="flex justify-end opacity-70">
          <div className="max-w-[80%] rounded-lg p-3 bg-gray-800/50 border border-gray-700/50 text-gray-300 italic border-dashed">
            <p className="text-sm">{streamingUserText}</p>
            <span className="text-[10px] opacity-50 block mt-1 animate-pulse">LISTENING...</span>
          </div>
        </div>
      )}

      {/* Real-time Streaming Model Output */}
      {streamingModelText && (
        <div className="flex justify-start opacity-70">
          <div className="max-w-[80%] rounded-lg p-3 bg-black/30 border border-gray-800/50 text-cyan-400/80 italic border-dashed">
             <p className="text-sm">{streamingModelText}</p>
             <span className="text-[10px] opacity-50 block mt-1 animate-pulse">GENERATING...</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};