import React, { createContext, useContext, useState } from 'react';
import { DrivingSequence, ChatMessage, MessageRole, ChatSession, SequenceSummary, SequenceFrameSummary } from '@/lib/types';
import { toast } from 'sonner';

// Create array of sequence IDs (excluding 08)
const sequenceIds = ['00', '01', '02', '03', '04', '05', '06', '07', '09', '10'];

// Fixed S3 URL creation
const createS3URL = (sceneId, filePath) => {
  // Format scene ID to ensure it's two digits
  const paddedId = sceneId.padStart(2, '0');
  const url = `https://d2u0hfgsz4s77s.cloudfront.net/scene_${paddedId}/${filePath}`;
  console.log(`Using S3 URL: ${url}`);
  return url;
};

// Create real sequences from available data
const realSequences: DrivingSequence[] = sequenceIds.map((id) => ({
  id,
  name: `Driving Sequence #${id}`,
  // Updated thumbnail path to match the S3 format
  thumbnail: createS3URL(id, "thumbnail.png"),
  description: `Driving sequence capture with various road elements`,
  date: new Date().toISOString().split("T")[0],
  // Fixed video path to match the exact structure shown in examples
  videoPath: createS3URL(id, `${id}.mp4`),
  frameSummariesPath: createS3URL(id, `stats/frame_summaries.json`),
  sequenceSummaryPath: createS3URL(id, `stats/sequence_summary.json`),
  // // Additional paths
  // posesPath: createS3URL(id, "poses.txt"),
  // calibPath: createS3URL(id, "calib.txt"),
  // timesPath: createS3URL(id, "times.txt"),
}));

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
  isVideoPlaying: boolean;
  currentVideoURL: string | null;
  closeVideoPlayer: () => void;
  currentVideoTitle: string | null;
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
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [currentVideoURL, setCurrentVideoURL] = useState<string | null>(null);
  const [currentVideoTitle, setCurrentVideoTitle] = useState<string | null>(null);

  // Select a sequence and initialize a new chat session
  const selectSequence = async (sequence: DrivingSequence) => {
    setSelectedSequence(sequence);
    try {
      console.log("Fetching data for sequence:", sequence.id);
      console.log("Frame summaries URL:", sequence.frameSummariesPath);
      console.log("Sequence summary URL:", sequence.sequenceSummaryPath);
      
      // Fetch JSON data from S3 or local files
      let frameSummaries;
      let sequenceSummary;
      
      try {
        const frameSummariesResponse = await fetch(sequence.frameSummariesPath, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!frameSummariesResponse.ok) {
          console.error(`Failed to fetch frame summaries from S3: ${frameSummariesResponse.status}`);
          toast.error(`Failed to load frame summaries (${frameSummariesResponse.status})`);
          throw new Error(`Failed to fetch frame summaries: ${frameSummariesResponse.status}`);
        }
        frameSummaries = await frameSummariesResponse.json();
      } catch (error) {
        console.error("Error loading frame summaries:", error);
        toast.error("Failed to load frame summaries");
        throw error;
      }
      
      try {
        const sequenceSummaryResponse = await fetch(sequence.sequenceSummaryPath, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!sequenceSummaryResponse.ok) {
          console.error(`Failed to fetch sequence summary from S3: ${sequenceSummaryResponse.status}`);
          toast.error(`Failed to load sequence summary (${sequenceSummaryResponse.status})`);
          throw new Error(`Failed to fetch sequence summary: ${sequenceSummaryResponse.status}`);
        }
        sequenceSummary = await sequenceSummaryResponse.json();
      } catch (error) {
        console.error("Error loading sequence summary:", error);
        toast.error("Failed to load sequence summary");
        throw error;
      }

      const welcomeMessage: ChatMessage = {
        id: `welcome-${sequence.id}`,
        role: MessageRole.ASSISTANT,
        content: `I'm ready to help you analyze driving sequence "${sequence.name}". This sequence contains detailed frame-by-frame data and motion analysis. What would you like to know about this driving scene?`,
        timestamp: Date.now(),
      };

      setChatSession({
        id: `session-${Date.now()}`,
        messages: [welcomeMessage],
        sequence,
      });
      
      toast.success(`Loaded sequence #${sequence.id} successfully`);
    } catch (error) {
      console.error("Error loading sequence data:", error);
      toast.error("Failed to load sequence data");
    }
  };

  const openVideoViewer = (sequence: DrivingSequence) => {
    if (sequence.videoPath) {
      const videoURL = sequence.videoPath;
      console.log("Opening video URL:", videoURL);
      
      // Set video data for modal
      setCurrentVideoURL(videoURL);
      setCurrentVideoTitle(`Driving Sequence ${sequence.id}`);
      setIsVideoPlaying(true);
    } else {
      console.error("No video path provided for sequence:", sequence.id);
      toast.error("No video available for this sequence");
    }
  };

  const closeVideoPlayer = () => {
    setIsVideoPlaying(false);
    setCurrentVideoURL(null);
    setCurrentVideoTitle(null);
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

      // Set appropriate types for the message parameters to match OpenAI API requirements
      const systemMessage = { 
        role: "system" as const, 
        content: MASTER_PROMPT 
      };
      
      const userContentMessage = { 
        role: "user" as const,
        content: `Sequence Information:
          - Frame Summaries: ${JSON.stringify(frameSummaries)}
          - Sequence Summary: ${JSON.stringify(sequenceSummary)}
          
          Please answer the following question about this driving sequence: ${content}`
      };

      // Use fetch directly for streaming to have better control
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY || "OPENROUTER_API_KEY"}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.href,
          'X-Title': 'PCD Chat Assistant',
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-exp:free",
          messages: [systemMessage, userContentMessage],
          stream: true,
        }),
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
      const reader = response.body!.getReader();
      let buffer = '';

      const processChunk = async ({ done, value }: { done: boolean; value?: Uint8Array }) => {
        if (done) {
          setIsProcessing(false);
          return;
        }

        if (value) {  // Check if value is defined before decoding
          buffer += new TextDecoder().decode(value);

          let index;
          while ((index = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);

            if (line.startsWith('data: ')) {
              // For "[DONE]" message
              if (line === 'data: [DONE]') {
                setIsProcessing(false);
                return;
              }

              const jsonStr = line.slice(6);
              try {
                const data = JSON.parse(jsonStr);
                if (data?.choices && data.choices[0]?.delta?.content) {
                  const token = data.choices[0].delta.content;
                  streamingContent += token;
                  setChatSession(prev => ({
                    ...prev,
                    messages: prev.messages.map(msg =>
                      msg.id === streamingMessageId ? { ...msg, content: streamingContent } : msg
                    ),
                  }));
                }
              } catch (e) {
                console.error('Error parsing JSON:', e);
              }
            }
          }
        }

        // Continue reading
        reader.read().then(processChunk).catch(err => {
          console.error("Error in stream processing:", err);
          setIsProcessing(false);
        });
      };

      reader.read().then(processChunk).catch(err => {
        console.error("Error in initial read:", err);
        setIsProcessing(false);
      });
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
      openVideoViewer, 
      isVideoPlaying, 
      currentVideoURL, 
      closeVideoPlayer, 
      currentVideoTitle }}>
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
