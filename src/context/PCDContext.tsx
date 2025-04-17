import React, { createContext, useContext, useState } from 'react';
import { DrivingSequence, ChatMessage, MessageRole, ChatSession, SequenceSummary, SequenceFrameSummary } from '@/lib/types';
import OpenAI from 'openai';

// Create array of sequence IDs (excluding 08)
const sequenceIds = ['00', '01', '02', '03', '04', '05', '06', '07', '09', '10'];

// Create real sequences from available data
const realSequences: DrivingSequence[] = sequenceIds.map((id) => ({
  id,
  name: `Driving Sequence #${id}`,
  thumbnail: `/src/assets/data/seq/${id}/thumbnail.png`,
  description: `Driving sequence capture with various road elements`,
  date: new Date().toISOString().split('T')[0],
  videoPath: `/src/assets/data/videos/${id}/${id}.mp4`,
  frameSummariesPath: `/src/assets/data/seq/${id}/frame_summaries.json`,
  sequenceSummaryPath: `/src/assets/data/seq/${id}/sequence_summary.json`,
}));

// Initialize OpenAI client for OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY,
  dangerouslyAllowBrowser: true,
  defaultHeaders: {
    "HTTP-Referer": window.location.href,
    "X-Title": "PCD Chat Assistant",
  },
});

// Master prompt for the LLM
const MASTER_PROMPT = `
You are an AI assistant that analyzes and describes road scenes from driving sequence data. 
You will be provided with sequence summaries and frame-by-frame data, including class percentages, ego vehicle motion, and semantic details. Use this data to understand and analyze the driving scenes thoroughly.

**Guidelines:**
- Use the provided sequence data to inform your analysis but don't quote raw values unless specifically asked
- Provide user-friendly, natural responses that explain the scene context
- Focus on relevant details that help users understand the driving scenario
- Format responses using proper markdown for react-markdown rendering
- Keep responses concise unless asked for more detail

**Internal Reference (for analysis only):**
\`\`\`
SEMANTIC_KITTI_COLORMAP = {
    0: [0, 0, 0],          // Unlabeled
    1: [255, 255, 255],    // Outlier
    10: [255, 0, 0],       // Car
    11: [255, 128, 0],     // Bicycle
    13: [255, 255, 0],     // Bus
    15: [128, 0, 255],     // Motorcycle
    16: [255, 0, 255],     // On Rails
    18: [0, 255, 255],     // Truck
    20: [128, 128, 0],     // Other vehicle
    30: [0, 0, 255],       // Person
    31: [0, 255, 0],       // Bicyclist
    32: [255, 255, 255],   // Motorcyclist
    40: [128, 0, 0],       // Road
    44: [128, 128, 128],   // Parking
    48: [0, 128, 128],     // Sidewalk
    49: [128, 0, 128],     // Other ground
    50: [0, 128, 0],       // Building
    51: [128, 128, 128],   // Fence
    52: [0, 0, 128],       // Vegetation
    53: [128, 0, 0],       // Trunk
    54: [0, 128, 128],     // Terrain
    60: [0, 0, 255],       // Pole
    61: [255, 255, 0],     // Traffic sign
    70: [128, 128, 0],     // Other man-made
    71: [0, 255, 255],     // Sky
    72: [255, 0, 128],     // Water
    80: [255, 255, 255],   // Ego vehicle
    81: [255, 255, 255],   // Dynamic
    99: [128, 128, 128],   // Other
    252: [255, 0, 0],      // Moving-car
    253: [255, 128, 0],    // Moving-bicyclist
    254: [0, 0, 255],      // Moving-person
    255: [0, 255, 0],      // Moving-motorcyclist
    256: [255, 0, 255],    // Moving-other-vehicle
    257: [255, 255, 0]     // Moving-truck
}
\`\`\`
`;

// Types for the context
type PCDContextType = {
  sequences: DrivingSequence[];
  selectedSequence: DrivingSequence | null;
  selectSequence: (sequence: DrivingSequence) => void;
  chatSession: ChatSession;
  sendMessage: (content: string) => void;
  isProcessing: boolean;
  openVideoViewer: (sequence: DrivingSequence) => void;
};

// Create the context
const PCDContext = createContext<PCDContextType | undefined>(undefined);

// Provider component
export const PCDProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sequences] = useState<DrivingSequence[]>(realSequences);
  const [selectedSequence, setSelectedSequence] = useState<DrivingSequence | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession>({
    id: 'session-1',
    messages: [{
      id: 'system-1',
      role: MessageRole.SYSTEM,
      content: 'I can help you analyze and understand driving sequences. Select a sequence from the gallery to begin.',
      timestamp: Date.now(),
    }],
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Select a sequence and initialize a new chat session
  const selectSequence = async (sequence: DrivingSequence) => {
    setSelectedSequence(sequence);
    
    try {
      // Fetch sequence data
      const [frameSummaries, sequenceSummary] = await Promise.all([
        fetch(sequence.frameSummariesPath).then(res => res.json()) as Promise<SequenceFrameSummary[]>,
        fetch(sequence.sequenceSummaryPath).then(res => res.json()) as Promise<SequenceSummary>
      ]);
      
      // Create a welcome message
      const welcomeMessage: ChatMessage = {
        id: `welcome-${sequence.id}`,
        role: MessageRole.ASSISTANT,
        content: `I'm ready to help you analyze driving sequence "${sequence.name}". This sequence contains detailed frame-by-frame data and motion analysis. What would you like to know about this driving scene?`,
        timestamp: Date.now(),
      };
      
      // Reset chat session with the welcome message
      setChatSession({
        id: `session-${Date.now()}`,
        messages: [
          {
            id: 'system-1',
            role: MessageRole.SYSTEM,
            content: MASTER_PROMPT,
            timestamp: Date.now(),
          },
          welcomeMessage
        ],
        sequence,
      });
    } catch (error) {
      console.error('Error loading sequence data:', error);
    }
  };

  // Open video viewer in a new tab
  const openVideoViewer = (sequence: DrivingSequence) => {
    if (sequence.videoPath) {
      window.open(sequence.videoPath, '_blank');
    }
  };

  // Send a new message to the LLM
  const sendMessage = async (content: string) => {
    if (!content.trim() || !selectedSequence) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: MessageRole.USER,
      content,
      timestamp: Date.now(),
    };

    setChatSession(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
    }));

    // Set processing state
    setIsProcessing(true);

    // Add a loading message
    const loadingMessage: ChatMessage = {
      id: `assistant-loading-${Date.now()}`,
      role: MessageRole.ASSISTANT,
      content: '',
      timestamp: Date.now(),
      isLoading: true,
    };

    setChatSession(prev => ({
      ...prev,
      messages: [...prev.messages, loadingMessage],
    }));

    try {
      // Get the sequence data
      const frameSummaries = await fetch(selectedSequence.frameSummariesPath).then(res => res.json());
      const sequenceSummary = await fetch(selectedSequence.sequenceSummaryPath).then(res => res.json());

      // Prepare the request body
      const body = {
        model: "meta-llama/llama-4-maverick:free",
        messages: [
          {
            role: "system",
            content: MASTER_PROMPT,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Sequence Information:
                  - Frame Summaries: ${JSON.stringify(frameSummaries)}
                  - Sequence Summary: ${JSON.stringify(sequenceSummary)}
                  
                  Please answer the following question about this driving sequence: ${content}`,
              },
            ],
          },
        ],
        stream: true,
      };

      // Set only the necessary headers
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.href,
        'X-Title': 'PCD Chat Assistant',
      };

      // Make the fetch request
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Create a new assistant message for streaming
      let streamingContent = "";
      const streamingMessageId = `assistant-${Date.now()}`;
      setChatSession(prev => ({
        ...prev,
        messages: prev.messages.filter(msg => !msg.isLoading).concat({
          id: streamingMessageId,
          role: MessageRole.ASSISTANT,
          content: "",
          timestamp: Date.now(),
        }),
      }));

      // Handle the streaming response
      const reader = response.body.getReader();
      let buffer = '';

      const processChunk = async ({ done, value }: { done: boolean; value?: Uint8Array }) => {
        if (done) {
          setIsProcessing(false);
          return;
        }

        buffer += new TextDecoder().decode(value);

        let index;
        while ((index = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);

          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              const token = data.choices[0].delta?.content || "";
              streamingContent += token;
              setChatSession(prev => ({
                ...prev,
                messages: prev.messages.map(msg =>
                  msg.id === streamingMessageId ? { ...msg, content: streamingContent } : msg
                ),
              }));
            } catch (e) {
              console.error('Error parsing JSON:', e);
            }
          }
        }

        reader.read().then(processChunk);
      };

      reader.read().then(processChunk);
    } catch (error) {
      console.error("Error calling LLM:", error);

      const errorMessage: ChatMessage = {
        id: `assistant-error-${Date.now()}`,
        role: MessageRole.ASSISTANT,
        content: "I'm having trouble analyzing this scene right now. Please try again later.",
        timestamp: Date.now(),
      };

      setChatSession(prev => ({
        ...prev,
        messages: prev.messages.filter(msg => !msg.isLoading).concat(errorMessage),
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <PCDContext.Provider value={{ 
      sequences, 
      selectedSequence, 
      selectSequence, 
      chatSession, 
      sendMessage,
      isProcessing,
      openVideoViewer
    }}>
      {children}
    </PCDContext.Provider>
  );
};

// Custom hook for using the context
export const usePCD = () => {
  const context = useContext(PCDContext);
  if (context === undefined) {
    throw new Error('usePCD must be used within a PCDProvider');
  }
  return context;
};
