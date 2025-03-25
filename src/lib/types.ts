
// PCD (Point Cloud Data) types
export type PCDItem = {
  id: string;
  name: string;
  thumbnail: string;
  description?: string;
  date?: string;
  dataUrl?: string; // This would be the actual PCD data URL in production
};

// Chat message types
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isLoading?: boolean;
};

// Full chat session context
export type ChatSession = {
  id: string;
  messages: ChatMessage[];
  pcd?: PCDItem;
};
