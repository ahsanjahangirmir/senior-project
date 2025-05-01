import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import VideoModal from "@/components/VideoModal";
import { usePCD, PCDProvider } from "@/context/PCDContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Wrapper component that includes the VideoModal
const AppWithVideoModal = () => {
  const { isVideoPlaying, currentVideoURL, closeVideoPlayer, currentVideoTitle } = usePCD();
  
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      
      {/* Global Video Modal */}
      <VideoModal 
        isOpen={isVideoPlaying}
        videoURL={currentVideoURL}
        onClose={closeVideoPlayer}
        title={currentVideoTitle || "Video Player"}
      />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PCDProvider>
        <AppWithVideoModal />
      </PCDProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;