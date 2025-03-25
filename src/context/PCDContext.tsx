
import React, { createContext, useContext, useState, useEffect } from 'react';
import { PCDItem, ChatMessage, MessageRole, ChatSession } from '@/lib/types';

// Mock PCD data
const mockPCDs: PCDItem[] = [
  {
    id: '1',
    name: 'Urban Street Scene',
    thumbnail: '/placeholder.svg',
    description: 'Point cloud capture of an urban intersection with various vehicles and pedestrians',
    date: '2023-09-15',
  },
  {
    id: '2',
    name: 'Indoor Office Environment',
    thumbnail: '/placeholder.svg',
    description: 'Detailed scan of an office space showing furniture and equipment',
    date: '2023-10-22',
  },
  {
    id: '3',
    name: 'Forest Terrain',
    thumbnail: '/placeholder.svg',
    description: 'Natural environment capture showing trees, terrain and vegetation',
    date: '2023-11-05',
  },
  {
    id: '4',
    name: 'Industrial Warehouse',
    thumbnail: '/placeholder.svg',
    description: 'Large indoor space with machinery and storage structures',
    date: '2023-12-01',
  },
  {
    id: '5',
    name: 'Residential Building',
    thumbnail: '/placeholder.svg',
    description: 'Multi-story residential structure with detailed architectural features',
    date: '2024-01-14',
  },
  {
    id: '6',
    name: 'Highway Infrastructure',
    thumbnail: '/placeholder.svg',
    description: 'Complex highway interchange with multiple lanes and overpasses',
    date: '2024-02-20',
  },
];

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
};

// Create the context
const PCDContext = createContext<PCDContextType | undefined>(undefined);

// Provider component
export const PCDProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pcds] = useState<PCDItem[]>(mockPCDs);
  const [selectedPCD, setSelectedPCD] = useState<PCDItem | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession>({
    id: 'session-1',
    messages: [initialSystemMessage],
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Select a PCD and initialize a new chat session
  const selectPCD = (pcd: PCDItem) => {
    setSelectedPCD(pcd);
    
    // Create a new welcome message specific to the selected PCD
    const welcomeMessage: ChatMessage = {
      id: `welcome-${pcd.id}`,
      role: MessageRole.ASSISTANT,
      content: `I'm ready to help you analyze the "${pcd.name}" point cloud data. What would you like to know about this scene?`,
      timestamp: Date.now(),
    };
    
    // Reset chat session with the welcome message
    setChatSession({
      id: `session-${Date.now()}`,
      messages: [initialSystemMessage, welcomeMessage],
      pcd,
    });
  };

  // Send a new message
  const sendMessage = (content: string) => {
    if (!content.trim()) return;
    
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
    
    // Simulate assistant response
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
    
    // Simulate response delay
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: MessageRole.ASSISTANT,
        content: getMockResponse(content, selectedPCD),
        timestamp: Date.now(),
      };
      
      setChatSession(prev => ({
        ...prev,
        // Replace loading message with real message
        messages: prev.messages.filter(msg => !msg.isLoading).concat(assistantMessage),
      }));
      
      setIsProcessing(false);
    }, 1500);
  };

  // Mock response generator
  const getMockResponse = (userMessage: string, pcd: PCDItem | null): string => {
    if (!pcd) return "Please select a point cloud dataset first.";
    
    const responses = [
      `Based on the ${pcd.name} point cloud, I can see several interesting patterns. What specific aspects would you like me to analyze?`,
      `The ${pcd.name} dataset contains approximately 2.3 million points with an average density of 340 points per square meter.`,
      `I've identified several key objects in this scene. Would you like me to highlight specific features in the point cloud?`,
      `The point cloud resolution is sufficient for detailed analysis. Is there a particular region you'd like to focus on?`,
      `This data was likely captured using a LiDAR sensor with approximately 64 channels, based on the point distribution patterns.`,
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  };

  return (
    <PCDContext.Provider value={{ 
      pcds, 
      selectedPCD, 
      selectPCD, 
      chatSession, 
      sendMessage,
      isProcessing
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
