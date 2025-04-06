
import React, { createContext, useContext, useState, useEffect } from 'react';
import { PCDItem, ChatMessage, MessageRole, ChatSession } from '@/lib/types';
import statsData from '@/assets/data/stats.json';
import OpenAI from 'openai';

// Create real PCD items from stats data
const realPCDs: PCDItem[] = statsData.map((item) => {
  return {
    id: item.scene_no,
    name: `PCD #${item.scene_no}`,
    thumbnail: `/src/assets/data/projections/${item.scene_no}_projection.png`,
    description: `Point cloud capture with various objects and scene elements`,
    date: new Date().toISOString().split('T')[0],
    projectionPath: `/src/assets/data/projections/${item.scene_no}_projection.png`,
    pcdPath: `/src/assets/data/pcds/${item.scene_no}.pcd`
  };
});

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
You are an AI assistant that analyzes and describes road scenes from point cloud data.
You will be given a 2D projection image of a 3D road scene along with semantic details.
The semantic details include class percentages and object distances in the scene.

The colormap used in generating the projection is:
SEMANTIC_KITTI_COLORMAP = {
    0: [0, 0, 0],          # Unlabeled
    1: [255, 255, 255],    # Outlier
    10: [255, 0, 0],       # Car
    11: [255, 128, 0],     # Bicycle
    13: [255, 255, 0],     # Bus
    15: [128, 0, 255],     # Motorcycle
    16: [255, 0, 255],     # On Rails
    18: [0, 255, 255],     # Truck
    20: [128, 128, 0],     # Other vehicle
    30: [0, 0, 255],       # Person
    31: [0, 255, 0],       # Bicyclist
    32: [255, 255, 255],   # Motorcyclist
    40: [128, 0, 0],       # Road
    44: [128, 128, 128],   # Parking
    48: [0, 128, 128],     # Sidewalk
    49: [128, 0, 128],     # Other ground
    50: [0, 128, 0],       # Building
    51: [128, 128, 128],   # Fence
    52: [0, 0, 128],       # Vegetation
    53: [128, 0, 0],       # Trunk
    54: [0, 128, 128],     # Terrain
    60: [0, 0, 255],       # Pole
    61: [255, 255, 0],     # Traffic sign
    70: [128, 128, 0],     # Other man-made
    71: [0, 255, 255],     # Sky
    72: [255, 0, 128],     # Water
    80: [255, 255, 255],   # Ego vehicle
    81: [255, 255, 255],   # Dynamic
    99: [128, 128, 128],   # Other
    252: [255, 0, 0],      # Moving-car
    253: [255, 128, 0],    # Moving-bicyclist
    254: [0, 0, 255],      # Moving-person
    255: [0, 255, 0],      # Moving-motorcyclist
    256: [255, 0, 255],    # Moving-other-vehicle
    257: [255, 255, 0]     # Moving-truck
}

Please respond to the user's questions about the scene based on the provided semantic information and image.
`;

// Placeholder system messages
const initialSystemMessage: ChatMessage = {
  id: 'system-1',
  role: MessageRole.SYSTEM,
  content: 'I can help you analyze and understand point cloud data. Select a PCD from the gallery to begin.',
  timestamp: Date.now(),
};

// Types for the context
type PCDContextType = {
  pcds: PCDItem[];
  selectedPCD: PCDItem | null;
  selectPCD: (pcd: PCDItem) => void;
  chatSession: ChatSession;
  sendMessage: (content: string) => void;
  isProcessing: boolean;
  openPCDViewer: (pcd: PCDItem) => void;
};

// Create the context
const PCDContext = createContext<PCDContextType | undefined>(undefined);

// Provider component
export const PCDProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pcds] = useState<PCDItem[]>(realPCDs);
  const [selectedPCD, setSelectedPCD] = useState<PCDItem | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession>({
    id: 'session-1',
    messages: [initialSystemMessage],
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Select a PCD and initialize a new chat session
  const selectPCD = (pcd: PCDItem) => {
    setSelectedPCD(pcd);
    
    // Find the stats data for this PCD
    const pcdStats = statsData.find(item => item.scene_no === pcd.id);
    
    // Create a new welcome message specific to the selected PCD
    const welcomeMessage: ChatMessage = {
      id: `welcome-${pcd.id}`,
      role: MessageRole.ASSISTANT,
      content: `I'm ready to help you analyze the "${pcd.name}" point cloud data. This scene contains various elements including road, sidewalk, and some objects. What would you like to know about this scene?`,
      timestamp: Date.now(),
    };
    
    // Reset chat session with the welcome message
    setChatSession({
      id: `session-${Date.now()}`,
      messages: [initialSystemMessage, welcomeMessage],
      pcd,
    });
  };

  // Open PCD viewer in a new tab
  const openPCDViewer = (pcd: PCDItem) => {
    // Create a URL for the 3D viewer with the PCD path as a parameter
    const viewerUrl = `/viewer.html?pcd=${encodeURIComponent(pcd.pcdPath)}`;
    window.open(viewerUrl, '_blank');
  };

  // Send a new message to the LLM
  const sendMessage = async (content: string) => {
    if (!content.trim() || !selectedPCD) return;
    
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
      // Get the PCD stats
      const pcdStats = statsData.find(item => item.scene_no === selectedPCD.id);
      
      if (!pcdStats) {
        throw new Error(`Stats not found for PCD: ${selectedPCD.id}`);
      }
      
      // Prepare the prompt for the LLM
      const systemMessage = {
        role: "system" as const,
        content: MASTER_PROMPT
      };
      
      const userPromptMessage = {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: `Scene Information:
            - Class percentages: ${JSON.stringify(pcdStats.details.class_percentages)}
            - Object distances: ${JSON.stringify(pcdStats.details.distances)}
            
            This is the 2D projection of the scene. Please answer the following question about this scene: ${content}`
          },
          {
            type: "image_url" as const,
            image_url: {
              url: selectedPCD.projectionPath
            }
          }
        ]
      };
      
      // Call the LLM API
      const completion = await openai.chat.completions.create({
        model: "meta-llama/llama-4-maverick:free",
        messages: [systemMessage, userPromptMessage],
      });

      // Get the response
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: MessageRole.ASSISTANT,
        content: completion.choices[0].message.content || "I couldn't analyze this scene properly.",
        timestamp: Date.now(),
      };
      
      setChatSession(prev => ({
        ...prev,
        // Replace loading message with real message
        messages: prev.messages.filter(msg => !msg.isLoading).concat(assistantMessage),
      }));
    } catch (error) {
      console.error("Error calling LLM:", error);
      
      // Handle error
      const errorMessage: ChatMessage = {
        id: `assistant-error-${Date.now()}`,
        role: MessageRole.ASSISTANT,
        content: "I'm having trouble analyzing this scene right now. Please try again later.",
        timestamp: Date.now(),
      };
      
      setChatSession(prev => ({
        ...prev,
        // Replace loading message with error message
        messages: prev.messages.filter(msg => !msg.isLoading).concat(errorMessage),
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <PCDContext.Provider value={{ 
      pcds, 
      selectedPCD, 
      selectPCD, 
      chatSession, 
      sendMessage,
      isProcessing,
      openPCDViewer
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
