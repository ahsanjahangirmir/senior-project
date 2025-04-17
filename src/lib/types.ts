
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
  total_frames: number;
  total_duration: number;
  total_distance: number;
  average_speed: number;
  min_speed: number;
  max_speed: number;
  average_speed_from_frames: number;
  average_class_percentages: Record<string, number>;
  total_unique_classes: string[];
  time_series: Array<{
    timestamp: number;
    class_percentages: Record<string, number>;
    car_count: number;
    person_count: number;
  }>;
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
