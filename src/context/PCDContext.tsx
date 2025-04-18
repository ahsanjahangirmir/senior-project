import React, { createContext, useContext, useState } from "react";
import { DrivingSequence, ChatMessage, MessageRole, ChatSession, SequenceSummary, SequenceFrameSummary } from "@/lib/types";
import OpenAI from "openai";
import { toast } from "sonner";

const sequenceIds = ["00", "01", "02", "03", "04", "05", "06", "07", "09", "10"];

const realSequences: DrivingSequence[] = sequenceIds.map((id) => ({
  id,
  name: `Driving Sequence #${id}`,
  thumbnail: `/assets/data/seq/${id}/thumbnail.png`,
  description: `Driving sequence capture with various road elements`,
  date: new Date().toISOString().split("T")[0],
  videoPath: `/assets/data/videos/${id}/${id}.mp4`,
  frameSummariesPath: `/assets/data/seq/${id}/frame_summaries.json`,
  sequenceSummaryPath: `/assets/data/seq/${id}/sequence_summary.json`,
}));

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY || "OPENROUTER_API_KEY",
  dangerouslyAllowBrowser: true,
  defaultHeaders: {
    "HTTP-Referer": window.location.href,
    "X-Title": "PCD Chat Assistant",
  },
});

const MASTER_PROMPT = `
You are an AI assistant that analyzes and describes road scenes from driving sequence data.
The sequence data is provided in a compact format in the user's message. Parse it as follows:

- **Frame Summaries**: Each frame is separated by ';'. Within each frame, fields are separated by '|':
  - **class_percentages**: Format: "class1:val1,class2:val2,...". Example: "car:0.5,truck:0.2".
  - **ego_motion**: Format: "acceleration:val,direction:val,speed:val". Example: "acceleration:0.1,direction:north,speed:50".
  - **semantic_data**: JSON string with semantic details.
  - **instance_data**: JSON string with instance details.

- **Sequence Summary**: Fields separated by ',':
  - **total_frames**: Total number of frames (e.g., "total_frames:100").
  - **total_duration**: Total duration in seconds (e.g., "total_duration:10.5").
  - **total_distance**: Total distance traveled (e.g., "total_distance:500.0").
  - **average_speed**: Average speed (e.g., "average_speed:50.0").
  - **min_speed**: Minimum speed (e.g., "min_speed:0").
  - **max_speed**: Maximum speed (e.g., "max_speed:60").
  - **average_speed_from_frames**: Average speed from frames (e.g., "average_speed_from_frames:49.8").
  - **average_class_percentages**: Format: "class1:val1,class2:val2,...". Example: "car:0.69,road:51.43".

Use this data to analyze the driving scenes thoroughly.

**Guidelines:**
- Use the provided sequence data to inform your analysis but don't quote raw values unless specifically asked.
- Provide user-friendly, natural responses that explain the scene context.
- Focus on relevant details that help users understand the driving scenario.
- Format responses using proper markdown for react-markdown rendering.
- Keep responses concise unless asked for more detail.

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

type PCDContextType = {
  sequences: DrivingSequence[];
  selectedSequence: DrivingSequence | null;
  selectSequence: (sequence: DrivingSequence) => void;
  chatSession: ChatSession;
  sendMessage: (content: string) => void;
  isProcessing: boolean;
  openVideoViewer: (sequence: DrivingSequence) => void;
};

const PCDContext = createContext<PCDContextType | undefined>(undefined);

// Utility functions to compact data
const compactFrameSummaries = (frameSummaries: SequenceFrameSummary[]): string => {
  return frameSummaries
    .map((frame) => {
      const classPercentages = Object.entries(frame.class_percentages)
        .map(([key, value]) => `${key}:${value}`)
        .join(",");
      const egoMotion = `acceleration:${frame.ego_motion.acceleration},direction:${frame.ego_motion.direction},speed:${frame.ego_motion.speed}`;
      const semanticData = JSON.stringify(frame.semantic_data);
      const instanceData = JSON.stringify(frame.instance_data);
      return `${classPercentages}|${egoMotion}|${semanticData}|${instanceData}`;
    })
    .join(";");
};

const compactSequenceSummary = (sequenceSummary: SequenceSummary): string => {
  const fields = [
    `total_frames:${sequenceSummary.total_frames}`,
    `total_duration:${sequenceSummary.total_duration}`,
    `total_distance:${sequenceSummary.total_distance}`,
    `average_speed:${sequenceSummary.average_speed}`,
    `min_speed:${sequenceSummary.min_speed}`,
    `max_speed:${sequenceSummary.max_speed}`,
    `average_speed_from_frames:${sequenceSummary.average_speed_from_frames}`,
    `average_class_percentages:${Object.entries(sequenceSummary.average_class_percentages)
      .map(([key, value]) => `${key}:${value}`)
      .join(",")}`,
  ];
  return fields.join(",");
};

export const PCDProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sequences] = useState<DrivingSequence[]>(realSequences);
  const [selectedSequence, setSelectedSequence] = useState<DrivingSequence | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession>({
    id: "session-1",
    messages: [
      {
        id: "system-1",
        role: MessageRole.SYSTEM,
        content: "I can help you analyze and understand driving sequences. Select a sequence from the gallery to begin.",
        timestamp: Date.now(),
      },
    ],
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const selectSequence = async (sequence: DrivingSequence) => {
    setSelectedSequence(sequence);
    try {
      const [frameSummaries, sequenceSummary] = await Promise.all([
        fetch(sequence.frameSummariesPath).then((res) => res.json()) as Promise<SequenceFrameSummary[]>,
        fetch(sequence.sequenceSummaryPath).then((res) => res.json()) as Promise<SequenceSummary>,
      ]);

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
    } catch (error) {
      console.error("Error loading sequence data:", error);
      toast.error("Failed to load sequence data");
    }
  };

  const openVideoViewer = (sequence: DrivingSequence) => {
    if (sequence.videoPath) {
      const videoURL = sequence.videoPath;
      const videoWindow = window.open("", "_blank");
      if (videoWindow) {
        videoWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Driving Sequence ${sequence.id} - Video</title>
            <style>
              body { margin: 0; background: #000; height: 100vh; display: flex; align-items: center; justify-content: center; }
              video { max-width: 100%; max-height: 100vh; }
            </style>
          </head>
          <body>
            <video id="videoPlayer" controls autoplay muted>
              <source src="${videoURL}" type="video/mp4">
              Your browser does not support the video tag.
            </video>
            <script>
              const video = document.getElementById("videoPlayer");
              video.addEventListener("error", (e) => {
                console.error("Video playback error:", e);
                alert("Failed to play video. Check the console for details.");
              });
              video.addEventListener("loadeddata", () => {
                console.log("Video loaded successfully");
              });
            </script>
          </body>
          </html>
        `);
        videoWindow.document.close();
      } else {
        console.error("Failed to open new window for video playback");
      }
    } else {
      console.error("No video path provided for sequence:", sequence.id);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || !selectedSequence) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: MessageRole.USER,
      content,
      timestamp: Date.now(),
    };

    setChatSession((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
    }));

    setIsProcessing(true);

    const loadingMessage: ChatMessage = {
      id: `assistant-loading-${Date.now()}`,
      role: MessageRole.ASSISTANT,
      content: "",
      timestamp: Date.now(),
      isLoading: true,
    };

    setChatSession((prev) => ({
      ...prev,
      messages: [...prev.messages, loadingMessage],
    }));

    try {
      const frameSummaries = await fetch(selectedSequence.frameSummariesPath).then((res) => res.json());
      const sequenceSummary = await fetch(selectedSequence.sequenceSummaryPath).then((res) => res.json());
      const compactFrames = compactFrameSummaries(frameSummaries);
      const compactSummary = compactSequenceSummary(sequenceSummary);

      const systemMessage = {
        role: "system" as const,
        content: MASTER_PROMPT,
      };

      const userContentMessage = {
        role: "user" as const,
        content: `Sequence Data:
- Frame Summaries: ${compactFrames}
- Sequence Summary: ${compactSummary}

User Question: ${content}`,
      };

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY || "OPENROUTER_API_KEY"}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.href,
          "X-Title": "PCD Chat Assistant",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-exp:free",
          messages: [systemMessage, userContentMessage],
          stream: true,
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      let streamingContent = "";
      const streamingMessageId = `assistant-${Date.now()}`;
      setChatSession((prev) => ({
        ...prev,
        messages: prev.messages.filter((msg) => !msg.isLoading).concat({
          id: streamingMessageId,
          role: MessageRole.ASSISTANT,
          content: "",
          timestamp: Date.now(),
        }),
      }));

      const reader = response.body!.getReader();
      let buffer = "";

      const processChunk = async ({ done, value }: { done: boolean; value?: Uint8Array }) => {
        if (done) {
          setIsProcessing(false);
          return;
        }

        if (value) {
          buffer += new TextDecoder().decode(value);
          let index;
          while ((index = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);

            if (line.startsWith("data: ")) {
              if (line === "data: [DONE]") {
                setIsProcessing(false);
                return;
              }

              const jsonStr = line.slice(6);
              try {
                const data = JSON.parse(jsonStr);
                if (data?.choices && data.choices[0]?.delta?.content) {
                  const token = data.choices[0].delta.content;
                  streamingContent += token;
                  setChatSession((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) =>
                      msg.id === streamingMessageId ? { ...msg, content: streamingContent } : msg
                    ),
                  }));
                }
              } catch (e) {
                console.error("Error parsing JSON:", e);
              }
            }
          }
        }

        reader.read().then(processChunk).catch((err) => {
          console.error("Error in stream processing:", err);
          setIsProcessing(false);
        });
      };

      reader.read().then(processChunk).catch((err) => {
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
      setChatSession((prev) => ({
        ...prev,
        messages: prev.messages.filter((msg) => !msg.isLoading).concat(errorMessage),
      }));
      setIsProcessing(false);
    }
  };

  return (
    <PCDContext.Provider
      value={{
        sequences,
        selectedSequence,
        selectSequence,
        chatSession,
        sendMessage,
        isProcessing,
        openVideoViewer,
      }}
    >
      {children}
    </PCDContext.Provider>
  );
};

export const usePCD = () => {
  const context = useContext(PCDContext);
  if (context === undefined) {
    throw new Error("usePCD must be used within a PCDProvider");
  }
  return context;
};

// Previous state:

// import React, { createContext, useContext, useState } from 'react';
// import { DrivingSequence, ChatMessage, MessageRole, ChatSession, SequenceSummary, SequenceFrameSummary } from '@/lib/types';
// import OpenAI from 'openai';
// import { toast } from 'sonner';

// // Create array of sequence IDs (excluding 08)
// const sequenceIds = ['00', '01', '02', '03', '04', '05', '06', '07', '09', '10'];

// // Create real sequences from available data
// const realSequences: DrivingSequence[] = sequenceIds.map((id) => ({
//   id,
//   name: `Driving Sequence #${id}`,
//   thumbnail: `/src/assets/data/seq/${id}/thumbnail.png`,
//   description: `Driving sequence capture with various road elements`,
//   date: new Date().toISOString().split('T')[0],
//   videoPath: `/src/assets/data/videos/${id}/${id}.mp4`,
//   frameSummariesPath: `/src/assets/data/seq/${id}/frame_summaries.json`,
//   sequenceSummaryPath: `/src/assets/data/seq/${id}/sequence_summary.json`,
// }));

// // Initialize OpenAI client for OpenRouter
// const openai = new OpenAI({
//   baseURL: "https://openrouter.ai/api/v1",
//   apiKey: import.meta.env.VITE_OPENROUTER_API_KEY || "OPENROUTER_API_KEY",
//   dangerouslyAllowBrowser: true,
//   defaultHeaders: {
//     "HTTP-Referer": window.location.href,
//     "X-Title": "PCD Chat Assistant",
//   },
// });

// // Master prompt for the LLM
// const MASTER_PROMPT = `
// You are an AI assistant that analyzes and describes road scenes from driving sequence data. 
// You will be provided with sequence summaries and frame-by-frame data, including class percentages, ego vehicle motion, and semantic details. Use this data to understand and analyze the driving scenes thoroughly.

// **Guidelines:**
// - Use the provided sequence data to inform your analysis but don't quote raw values unless specifically asked
// - Provide user-friendly, natural responses that explain the scene context
// - Focus on relevant details that help users understand the driving scenario
// - Format responses using proper markdown for react-markdown rendering
// - Keep responses concise unless asked for more detail

// **Internal Reference (for analysis only):**
// \`\`\`
// SEMANTIC_KITTI_COLORMAP = {
//     0: [0, 0, 0],          // Unlabeled
//     1: [255, 255, 255],    // Outlier
//     10: [255, 0, 0],       // Car
//     11: [255, 128, 0],     // Bicycle
//     13: [255, 255, 0],     // Bus
//     15: [128, 0, 255],     // Motorcycle
//     16: [255, 0, 255],     // On Rails
//     18: [0, 255, 255],     // Truck
//     20: [128, 128, 0],     // Other vehicle
//     30: [0, 0, 255],       // Person
//     31: [0, 255, 0],       // Bicyclist
//     32: [255, 255, 255],   // Motorcyclist
//     40: [128, 0, 0],       // Road
//     44: [128, 128, 128],   // Parking
//     48: [0, 128, 128],     // Sidewalk
//     49: [128, 0, 128],     // Other ground
//     50: [0, 128, 0],       // Building
//     51: [128, 128, 128],   // Fence
//     52: [0, 0, 128],       // Vegetation
//     53: [128, 0, 0],       // Trunk
//     54: [0, 128, 128],     // Terrain
//     60: [0, 0, 255],       // Pole
//     61: [255, 255, 0],     // Traffic sign
//     70: [128, 128, 0],     // Other man-made
//     71: [0, 255, 255],     // Sky
//     72: [255, 0, 128],     // Water
//     80: [255, 255, 255],   // Ego vehicle
//     81: [255, 255, 255],   // Dynamic
//     99: [128, 128, 128],   // Other
//     252: [255, 0, 0],      // Moving-car
//     253: [255, 128, 0],    // Moving-bicyclist
//     254: [0, 0, 255],      // Moving-person
//     255: [0, 255, 0],      // Moving-motorcyclist
//     256: [255, 0, 255],    // Moving-other-vehicle
//     257: [255, 255, 0]     // Moving-truck
// }
// \`\`\`
// `;

// // Types for the context
// type PCDContextType = {
//   sequences: DrivingSequence[];
//   selectedSequence: DrivingSequence | null;
//   selectSequence: (sequence: DrivingSequence) => void;
//   chatSession: ChatSession;
//   sendMessage: (content: string) => void;
//   isProcessing: boolean;
//   openVideoViewer: (sequence: DrivingSequence) => void;
// };

// // Create the context
// const PCDContext = createContext<PCDContextType | undefined>(undefined);

// // Provider component
// export const PCDProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
//   const [sequences] = useState<DrivingSequence[]>(realSequences);
//   const [selectedSequence, setSelectedSequence] = useState<DrivingSequence | null>(null);
//   const [chatSession, setChatSession] = useState<ChatSession>({
//     id: 'session-1',
//     messages: [{
//       id: 'system-1',
//       role: MessageRole.SYSTEM,
//       content: 'I can help you analyze and understand driving sequences. Select a sequence from the gallery to begin.',
//       timestamp: Date.now(),
//     }],
//   });
//   const [isProcessing, setIsProcessing] = useState(false);

//   // Select a sequence and initialize a new chat session
//   const selectSequence = async (sequence: DrivingSequence) => {
//     setSelectedSequence(sequence);
    
//     try {
//       // Fetch sequence data
//       const [frameSummaries, sequenceSummary] = await Promise.all([
//         fetch(sequence.frameSummariesPath).then(res => res.json()) as Promise<SequenceFrameSummary[]>,
//         fetch(sequence.sequenceSummaryPath).then(res => res.json()) as Promise<SequenceSummary>
//       ]);
      
//       // Create a welcome message
//       const welcomeMessage: ChatMessage = {
//         id: `welcome-${sequence.id}`,
//         role: MessageRole.ASSISTANT,
//         content: `I'm ready to help you analyze driving sequence "${sequence.name}". This sequence contains detailed frame-by-frame data and motion analysis. What would you like to know about this driving scene?`,
//         timestamp: Date.now(),
//       };
      
//       // Reset chat session with the welcome message but don't include the master prompt in the visible messages
//       setChatSession({
//         id: `session-${Date.now()}`,
//         messages: [welcomeMessage],
//         sequence,
//       });
//     } catch (error) {
//       console.error('Error loading sequence data:', error);
//       toast.error('Failed to load sequence data');
//     }
//   };

//   // Open video viewer in a new tab
//   const openVideoViewer = (sequence: DrivingSequence) => {
//     if (sequence.videoPath) {
//       // Open in new tab with proper HTML5 video player
//       const videoURL = sequence.videoPath;
//       const videoWindow = window.open('', '_blank');
//       if (videoWindow) {
//         videoWindow.document.write(`
//           <!DOCTYPE html>
//           <html>
//           <head>
//             <title>Driving Sequence ${sequence.id} - Video</title>
//             <style>
//               body { margin: 0; background: #000; height: 100vh; display: flex; align-items: center; justify-content: center; }
//               video { max-width: 100%; max-height: 100vh; }
//             </style>
//           </head>
//           <body>
//             <video controls autoplay>
//               <source src="${videoURL}" type="video/mp4">
//               Your browser does not support the video tag.
//             </video>
//           </body>
//           </html>
//         `);
//         videoWindow.document.close();
//       }
//     }
//   };

//   // Send a new message to the LLM
//   const sendMessage = async (content: string) => {
//     if (!content.trim() || !selectedSequence) return;

//     // Add user message
//     const userMessage: ChatMessage = {
//       id: `user-${Date.now()}`,
//       role: MessageRole.USER,
//       content,
//       timestamp: Date.now(),
//     };

//     setChatSession(prev => ({
//       ...prev,
//       messages: [...prev.messages, userMessage],
//     }));

//     // Set processing state
//     setIsProcessing(true);

//     // Add a loading message
//     const loadingMessage: ChatMessage = {
//       id: `assistant-loading-${Date.now()}`,
//       role: MessageRole.ASSISTANT,
//       content: '',
//       timestamp: Date.now(),
//       isLoading: true,
//     };

//     setChatSession(prev => ({
//       ...prev,
//       messages: [...prev.messages, loadingMessage],
//     }));

//     try {
//       // Get the sequence data
//       const frameSummaries = await fetch(selectedSequence.frameSummariesPath).then(res => res.json());
//       const sequenceSummary = await fetch(selectedSequence.sequenceSummaryPath).then(res => res.json());

//       // Set appropriate types for the message parameters to match OpenAI API requirements
//       const systemMessage = { 
//         role: "system" as const, 
//         content: MASTER_PROMPT 
//       };
      
//       const userContentMessage = { 
//         role: "user" as const,
//         content: `Sequence Information:
//           - Frame Summaries: ${JSON.stringify(frameSummaries)}
//           - Sequence Summary: ${JSON.stringify(sequenceSummary)}
          
//           Please answer the following question about this driving sequence: ${content}`
//       };

//       // Use fetch directly for streaming to have better control
//       const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
//         method: 'POST',
//         headers: {
//           'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY || "OPENROUTER_API_KEY"}`,
//           'Content-Type': 'application/json',
//           'HTTP-Referer': window.location.href,
//           'X-Title': 'PCD Chat Assistant',
//         },
//         body: JSON.stringify({
//           model: "google/gemini-2.0-flash-exp:free",
//           messages: [systemMessage, userContentMessage],
//           stream: true,
//         }),
//       });

//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }

//       // Create a new assistant message for streaming
//       let streamingContent = "";
//       const streamingMessageId = `assistant-${Date.now()}`;
//       setChatSession(prev => ({
//         ...prev,
//         messages: prev.messages.filter(msg => !msg.isLoading).concat({
//           id: streamingMessageId,
//           role: MessageRole.ASSISTANT,
//           content: "",
//           timestamp: Date.now(),
//         }),
//       }));

//       // Handle the streaming response
//       const reader = response.body!.getReader();
//       let buffer = '';

//       const processChunk = async ({ done, value }: { done: boolean; value?: Uint8Array }) => {
//         if (done) {
//           setIsProcessing(false);
//           return;
//         }

//         if (value) {  // Check if value is defined before decoding
//           buffer += new TextDecoder().decode(value);

//           let index;
//           while ((index = buffer.indexOf('\n')) !== -1) {
//             const line = buffer.slice(0, index);
//             buffer = buffer.slice(index + 1);

//             if (line.startsWith('data: ')) {
//               // For "[DONE]" message
//               if (line === 'data: [DONE]') {
//                 setIsProcessing(false);
//                 return;
//               }

//               const jsonStr = line.slice(6);
//               try {
//                 const data = JSON.parse(jsonStr);
//                 if (data?.choices && data.choices[0]?.delta?.content) {
//                   const token = data.choices[0].delta.content;
//                   streamingContent += token;
//                   setChatSession(prev => ({
//                     ...prev,
//                     messages: prev.messages.map(msg =>
//                       msg.id === streamingMessageId ? { ...msg, content: streamingContent } : msg
//                     ),
//                   }));
//                 }
//               } catch (e) {
//                 console.error('Error parsing JSON:', e);
//               }
//             }
//           }
//         }

//         // Continue reading
//         reader.read().then(processChunk).catch(err => {
//           console.error("Error in stream processing:", err);
//           setIsProcessing(false);
//         });
//       };

//       reader.read().then(processChunk).catch(err => {
//         console.error("Error in initial read:", err);
//         setIsProcessing(false);
//       });
//     } catch (error) {
//       console.error("Error calling LLM:", error);

//       const errorMessage: ChatMessage = {
//         id: `assistant-error-${Date.now()}`,
//         role: MessageRole.ASSISTANT,
//         content: "I'm having trouble analyzing this scene right now. Please try again later.",
//         timestamp: Date.now(),
//       };

//       setChatSession(prev => ({
//         ...prev,
//         messages: prev.messages.filter(msg => !msg.isLoading).concat(errorMessage),
//       }));
      
//       setIsProcessing(false);
//     }
//   };

//   return (
//     <PCDContext.Provider value={{ 
//       sequences, 
//       selectedSequence, 
//       selectSequence, 
//       chatSession, 
//       sendMessage,
//       isProcessing,
//       openVideoViewer
//     }}>
//       {children}
//     </PCDContext.Provider>
//   );
// };

// // Custom hook for using the context
// export const usePCD = () => {
//   const context = useContext(PCDContext);
//   if (context === undefined) {
//     throw new Error('usePCD must be used within a PCDProvider');
//   }
//   return context;
// };
