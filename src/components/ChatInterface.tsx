
import React, { useState, useRef, useEffect } from 'react';
import { usePCD } from '@/context/PCDContext';
import ChatMessage from './ChatMessage';
import { ArrowUp, Play } from 'lucide-react';
import { Button } from './ui/button';

const ChatInterface: React.FC = () => {
  const { selectedSequence, chatSession, sendMessage, isProcessing, openVideoViewer } = usePCD();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatSession.messages]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isProcessing) {
      sendMessage(inputValue);
      setInputValue('');
    }
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Sequence Preview section */}
      <div className="h-1/3 p-4 pb-0 relative">
        {selectedSequence && (
          <div className="relative h-full rounded-lg overflow-hidden bg-muted">
            <img 
              src={selectedSequence.thumbnail}
              alt={selectedSequence.name}
              className="w-full h-full object-cover"
            />
            <Button
              className="absolute bottom-4 right-4"
              onClick={() => selectedSequence && openVideoViewer(selectedSequence)}
            >
              <Play className="w-4 h-4 mr-2" />
              Watch Video
            </Button>
          </div>
        )}
      </div>
      
      {/* Chat section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="chat-messages flex-1 overflow-y-auto p-4">
          {chatSession.messages.map(message => (
            <ChatMessage key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <form onSubmit={handleSubmit} className="input-container glass p-4 border-t border-border">
          <div className="relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={selectedSequence ? "Ask about this driving sequence..." : "Select a sequence first"}
              disabled={!selectedSequence || isProcessing}
              className="w-full px-4 py-3 pr-12 rounded-full bg-accent/40 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 transition-all duration-200"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || !selectedSequence || isProcessing}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 disabled:bg-muted transition-all duration-200"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
