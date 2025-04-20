import React, { createContext, useContext, useState } from "react";
import { DrivingSequence, ChatMessage, MessageRole, ChatSession, SequenceSummary, SequenceFrameSummary } from "@/lib/types";
import OpenAI from "openai";
import { toast } from "sonner";

const sequenceIds = ["00", "01", "02", "03", "04", "05", "06", "07", "09", "10"];

// Fixed S3 URL creation
const createS3URL = (sceneId, filePath) => {
  // Format scene ID to ensure it's two digits
  const paddedId = sceneId.padStart(2, '0');
  const url = `https://scene-understanding-sporj.s3.us-east-1.amazonaws.com/scene_${paddedId}/${filePath}`;
  console.log(`Using S3 URL: ${url}`);
  return url;
};

const realSequences: DrivingSequence[] = sequenceIds.map((id) => ({
  id,
  name: `Driving Sequence #${id}`,
  thumbnail: `/assets/data/seq/${id}/thumbnail.png`, // Keep local thumbnail path
  description: `Driving sequence capture with various road elements`,
  date: new Date().toISOString().split("T")[0],
  // Fixed paths to match the exact structure shown in examples
  videoPath: createS3URL(id, `sequence_${id}_animation.mp4`),
  frameSummariesPath: createS3URL(id, `stats/frame_summaries.json`),
  sequenceSummaryPath: createS3URL(id, `stats/sequence_summary.json`),
  // Additional paths
  posesPath: createS3URL(id, "poses.txt"),
  calibPath: createS3URL(id, "calib.txt"),
  timesPath: createS3URL(id, "times.txt"),
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

// Function to fetch additional text files for future use
const fetchTextFile = async (url: string) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'text/plain',
      },
    });
    if (!response.ok) {
      console.warn(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.warn(`Error fetching ${url}:`, error);
    return null;
  }
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
  // State for additional data files
  const [additionalData, setAdditionalData] = useState<{
    poses: Record<string, string | null>;
    calib: Record<string, string | null>;
    times: Record<string, string | null>;
  }>({
    poses: {},
    calib: {},
    times: {},
  });

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
                alert("Failed to play video from S3. Check the console for details.");
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
        toast.error("Failed to open video player (popup blocked?)");
      }
    } else {
      console.error("No video path provided for sequence:", sequence.id);
      toast.error("No video available for this sequence");
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
      // Fetch data from local files or S3
      let frameSummaries;
      let sequenceSummary;
      
      try {
        const frameSummariesResponse = await fetch(selectedSequence.frameSummariesPath, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!frameSummariesResponse.ok) {
          console.error(`Failed to fetch frame summaries from S3: ${frameSummariesResponse.status}`);
          throw new Error(`Failed to fetch frame summaries: ${frameSummariesResponse.status}`);
        }
        frameSummaries = await frameSummariesResponse.json();
      } catch (error) {
        console.error("Error loading frame summaries:", error);
        toast.error("Failed to load frame summaries");
        throw error;
      }
      
      try {
        const sequenceSummaryResponse = await fetch(selectedSequence.sequenceSummaryPath, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!sequenceSummaryResponse.ok) {
          console.error(`Failed to fetch sequence summary from S3: ${sequenceSummaryResponse.status}`);
          throw new Error(`Failed to fetch sequence summary: ${sequenceSummaryResponse.status}`);
        }
        sequenceSummary = await sequenceSummaryResponse.json();
      } catch (error) {
        console.error("Error loading sequence summary:", error);
        toast.error("Failed to load sequence summary");
        throw error;
      }
      
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
