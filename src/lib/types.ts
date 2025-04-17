// Sequence data types
export type SequenceFrameSummary = {
  class_percentages: Record<string, number>;
  ego_motion: {
    acceleration: number;
    direction: string;
    speed: number;
  };
  semantic_data: Record<string, any>;
  instance_data: Record<string, any>;
};

export type SequenceSummary = {
  max_speed: number;
  min_speed: number;
  class_presence_timeline: Record<string, number[]>;
  // Add other fields as needed
};

// Convert PCD to Sequence
export type DrivingSequence = {
  id: string;
  name: string;
  thumbnail: string;
  description?: string;
  date?: string;
  videoPath?: string;
  frameSummariesPath: string;
  sequenceSummaryPath: string;
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
  sequence?: DrivingSequence;
};
