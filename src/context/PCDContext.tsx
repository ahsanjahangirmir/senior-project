import React, { createContext, useContext, useState } from 'react';
import { DrivingSequence, ChatMessage, MessageRole, ChatSession} from '@/lib/types';
import { toast } from 'sonner';

export interface LLMInstrumentationEntry {
  timestampStart: string;
  sequenceId: string | null;
  promptText: string;
  requestPayloadChars: number;
  requestPayloadTokensEstimated: number;
  httpStatusCode: number | null;
  timeToFirstByteMs: number | null;
  totalResponseTimeMs: number | null;
  responseTotalChars: number;
  responseTotalTokensEstimated: number;
  tokensPerSecond: number | null;
  llmCallSuccess: boolean;
  llmResponseText: string;
  errorMessage?: string;
}

const llmInstrumentationData: LLMInstrumentationEntry[] = [];

// Function to log data (optional, you can just push directly)
const recordLLMInstrumentation = (entry: LLMInstrumentationEntry) => {
  llmInstrumentationData.push(entry);
  console.log("LLM Instrumentation Entry:", entry); // For real-time feedback during evaluation
};

// Function to get all metrics (e.g., to copy from console or save)
(window as any).getLLMInstrumentationData = () => {
  console.log(JSON.stringify(llmInstrumentationData, null, 2));
  return llmInstrumentationData;
};

// const sequenceIds = ['00', '01', '02', '03', '04', '05', '06', '07', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];
const sequenceIds = ['01', '03', '04', '06', '07', '09', '10', '11', '12', '14', '16', '17', '18', '20'];

const getThumbnailPath =        (id: string) => `/assets/thumbnails/${id}.png`;
const getFrameSummariesPath =   (id: string) => `/assets/context/${id}/frame_summaries.json`;
const getSequenceSummaryPath =  (id: string) => `/assets/context/${id}/sequence_summary.json`;
const getVideoPath =            (id: string) => `/assets/videos/${id}.mp4`;

const realSequences: DrivingSequence[] = sequenceIds.map((id) => ({
  id,
  name: `Driving Sequence #${id}`,
  thumbnail: getThumbnailPath(id),
  description: `Driving sequence capture with various road elements`,
  date: new Date().toISOString().split("T")[0],
  videoPath: getVideoPath(id),
  frameSummariesPath: getFrameSummariesPath(id),
  sequenceSummaryPath: getSequenceSummaryPath(id),
}));

const stripGeminiCitations = (text: string) =>
  text.replace(/:contentReference\[oaicite:\d+]\{index=\d+}/g, "");

// Master prompt for the LLM
const MASTER_PROMPT = `
You are a specialized AI assistant for interpreting and describing 3D driving sequences. Your job is to read the provided **sequence_summary.json** (overall stats) and **frame_summaries.json** (per-frame details) and transform them into human-friendly insights—never dumping raw data.

---
CONTEXT  
The sequence represents a single vehicle journey lasting **{{total_duration}} seconds**, covering **{{total_distance}} meters** at an average speed of **{{average_speed}} m/s** :contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}. Frame data includes timestamped object counts, ego-motion (speed/acceleration), and semantic class distributions :contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}.

---
GENERAL GUIDELINES  
1. **Speak in elapsed time, not frame IDs.**  
   - E.g. “For the first 4 s, there were five cars around the vehicle; by 0.8 s this dropped to one.”  
2. **Use the full sequence.**  
   - Review all frames before answering; don’t fixate on the first few frames.  
3. **Filter to relevant classes/objects.**  
   - Only report meaningful categories (e.g. “cars,” “pedestrians,” “traffic signs,” “buildings,” “poles”). Exclude “unknown_72,” “unlabeled,” etc., unless specifically requested.  
4. **Abstract numbers into narratives.**  
   - Translate counts and percentages into plain language: “traffic poles line both sides of the road,” “road surface dominates (≈40 % of view).”  
5. **Avoid raw numeric fields.**  
   - Don’t mention data keys like "direction: 0.3984". Instead say “the vehicle maintained a steady heading” or “the steering angle barely changed.”  
6. **Be concise and engaging.**  
   - Write as if telling a story of the drive: “We cruise down a straight stretch, then glide past a row of poles…”  
7. **Markdown formatting for react-markdown.**  
   - Use headings, bullet lists, and italics where helpful—but keep it simple.

---
EXAMPLE BEHAVIORS  

> **Bad:**  
> “car_count = 5 at frame 000000, car_count = 4 at frame 000002, direction = 0.1212”  
>  
> **Good:**  
> “In the opening second (0 – 0.2 s), you pass through light traffic—about five vehicles buffer your path. By 0.2 s, traffic thins to four cars as you settle into the main lane.”

---
TASKS  

- **Count objects:** “How many cars are present?”  
  - → “There are usually 2–3 cars around you, peaking at five in the first 0.1 s, then settling to one for the middle half of the drive.”  
- **Identify sharp turns:** “When does the vehicle make a sharp turn?”  
  - → If no sharp turn occurs over 28 s, answer “The route remains mostly straight—no sharp turns detected.”  
- **List distinct objects:** “What objects appear?”  
  - → “You see cars, moving vehicles, traffic signs, poles, sidewalks, and buildings.”

---
Always ground your answer in the summary data but wrap it in natural, time-based narrative so the user sees **what happened**, **when**, and **why**—not the raw numbers behind it.  

`;

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

const PCDContext = createContext<PCDContextType | undefined>(undefined);

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

    const entry: Partial<LLMInstrumentationEntry> = { 
      timestampStart: new Date().toISOString(),
      sequenceId: selectedSequence?.id || null,
      promptText: content,
      httpStatusCode: null,
      timeToFirstByteMs: null,
      totalResponseTimeMs: null,
      responseTotalChars: 0,
      responseTotalTokensEstimated: 0,
      tokensPerSecond: null,
      llmResponseText: "",
      llmCallSuccess: false, // Default to false
    };
    
    const tStartRequest = performance.now();

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

    let tFirstByteReceived: number | null = null;

    try {
      const frameSummaries = await fetch(selectedSequence.frameSummariesPath).then(res => res.json());
      const sequenceSummary = await fetch(selectedSequence.sequenceSummaryPath).then(res => res.json());

      const requestBody = {
        system_instruction: {
          parts: [{ text: MASTER_PROMPT }],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Sequence Information:
        - Frame Summaries: ${JSON.stringify(frameSummaries)}
        - Sequence Summary: ${JSON.stringify(sequenceSummary)}
        
        ${content}`,
              },
            ],
          },
        ],
      };

      // --- Instrumentation: Request Payload Metrics ---
      const requestBodyString = JSON.stringify(requestBody);
      entry.requestPayloadChars = requestBodyString.length;
      entry.requestPayloadTokensEstimated = Math.ceil(entry.requestPayloadChars / 4); // Heuristic

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${import.meta.env.VITE_GEMINI_API_KEY || "GEMINI_API_KEY"}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: requestBodyString,
        }
      );

      entry.httpStatusCode = response.status;

      if (!response.ok) {
        const errorText = await response.text();
        entry.errorMessage = `HTTP error ${response.status}: ${errorText}`;
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
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
        
        if (value && tFirstByteReceived === null) {
          // --- Instrumentation: Time to First Byte ---
          tFirstByteReceived = performance.now();
          entry.timeToFirstByteMs = tFirstByteReceived - tStartRequest;
        }
        
        if (done) {
          // --- Instrumentation: Final Metrics on Done ---
          const tEndResponse = performance.now();
          entry.totalResponseTimeMs = tEndResponse - tStartRequest;
          entry.responseTotalTokensEstimated = Math.ceil(entry.responseTotalChars! / 4); // Heuristic
          entry.llmResponseText = streamingContent;
          if (entry.timeToFirstByteMs && entry.totalResponseTimeMs && entry.responseTotalTokensEstimated > 0) {
            const streamingDurationMs = entry.totalResponseTimeMs - entry.timeToFirstByteMs;
            if (streamingDurationMs > 0) {
              entry.tokensPerSecond = (entry.responseTotalTokensEstimated / (streamingDurationMs / 1000));
            }
          }
          entry.llmCallSuccess = true;
          entry.llmResponseText = streamingContent || "";
          recordLLMInstrumentation(entry as LLMInstrumentationEntry);
          setIsProcessing(false);
          return;
        }

        if (value) {
          buffer += new TextDecoder().decode(value);
          let index;
          while ((index = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);

            if (line.startsWith('data: ')) {
              if (line === 'data: [DONE]') { // Should be caught by `done` flag above, but as a safeguard
                setIsProcessing(false); // Might already be set by `done` path
                // Consider if final metrics need to be recorded here if `done` wasn't hit first
                return;
              }
              const jsonStr = line.slice(6);
              try {
                const data = JSON.parse(jsonStr);
                if (data?.candidates &&
                  data.candidates[0]?.content?.parts &&
                  data.candidates[0].content.parts[0]?.text) {
                  const raw = data.candidates[0].content.parts[0].text || "";
                  // --- Instrumentation: Accumulate Response Chars ---
                  entry.responseTotalChars! += raw.length;
                  // --- Instrumentation: END Accumulate ---
                  const token = stripGeminiCitations(raw);
                  streamingContent += token;
                  setChatSession(prev => ({
                    ...prev,
                    messages: prev.messages.map(msg =>
                      msg.id === streamingMessageId ? { ...msg, content: streamingContent } : msg
                    ),
                  }));
                }
              } catch (e) {
                console.error('Error parsing JSON chunk:', e, "Chunk:", jsonStr);
              }
            }
          }
        }
        reader.read().then(processChunk).catch(err => {
          console.error("Error in stream processing (read continuation):", err);
          // --- Instrumentation: Error during stream ---
          const tEndResponse = performance.now();
          entry.totalResponseTimeMs = tEndResponse - tStartRequest;
          entry.errorMessage = err.message || 'Error in stream processing';
          entry.llmCallSuccess = false;
          entry.llmResponseText = streamingContent || "";
          recordLLMInstrumentation(entry as LLMInstrumentationEntry);
          // --- Instrumentation: END Error ---
          setIsProcessing(false);
        });
      };

      reader.read().then(processChunk).catch(err => {
        console.error("Error in initial stream read:", err);
         // --- Instrumentation: Error on initial read ---
        const tEndResponse = performance.now();
        entry.totalResponseTimeMs = tEndResponse - tStartRequest;
        entry.errorMessage = err.message || 'Error in initial stream read';
        entry.llmCallSuccess = false;
        entry.llmResponseText = streamingContent || "";
        recordLLMInstrumentation(entry as LLMInstrumentationEntry);
        // --- Instrumentation: END Error ---
        setIsProcessing(false);
      });
    } catch (error: any) {
      console.error("Error calling LLM or processing its response:", error);
      const tEndResponse = performance.now(); // Time of catching the error
      // --- Instrumentation: Catch Block Error ---
      entry.totalResponseTimeMs = tEndResponse - tStartRequest;
      entry.errorMessage = error.message || 'Generic error in sendMessage';
      if (error.response && error.response.status) { // If error object has response details
          entry.httpStatusCode = error.response.status;
      }
      entry.llmCallSuccess = false;
      recordLLMInstrumentation(entry as LLMInstrumentationEntry);
      // --- Instrumentation: END Catch Block Error ---

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
