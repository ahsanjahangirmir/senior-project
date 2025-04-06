import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { ChatMessage as ChatMessageType, MessageRole } from '@/lib/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === MessageRole.USER;
  const isSystem = message.role === MessageRole.SYSTEM;
  
  if (isSystem) {
    return (
      <div className="p-3 rounded-lg bg-accent/30 text-center text-sm text-muted-foreground max-w-lg mx-auto my-4 animate-fade-in">
        {message.content}
      </div>
    );
  }
  
  if (message.isLoading) {
    return (
      <div className="message-assistant">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-medium text-primary">AI</span>
        </div>
        <div className="message-bubble-assistant animate-pulse-subtle">
          <div className="flex space-x-1">
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={isUser ? "message-user" : "message-assistant"}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-accent text-accent-foreground' : 'bg-primary/10 text-primary'
      }`}>
        <span className="text-xs font-medium">{isUser ? 'You' : 'AI'}</span>
      </div>
      <div className={isUser ? "message-bubble-user" : "message-bubble-assistant"}>
        <div className="prose">
          <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
