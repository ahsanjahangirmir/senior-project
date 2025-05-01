import React, { useRef, useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface VideoModalProps {
  isOpen: boolean;
  videoURL: string | null;
  onClose: () => void;
  title?: string;
}

const VideoModal: React.FC<VideoModalProps> = ({ 
  isOpen, 
  videoURL, 
  onClose,
  title = "Video Player"
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading video...");
  
  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setVideoLoaded(false);
      setVideoError(false);
      setLoadingMessage("Loading video...");
    }
  }, [isOpen]);
  
  // Handle video loading
  useEffect(() => {
    if (videoRef.current && videoURL) {
      const video = videoRef.current;
      
      const handleError = (e: Event) => {
        console.error("Video playback error:", e);
        setVideoError(true);
        setVideoLoaded(false);
        toast.error("Failed to play video from S3. Please try again.");
      };
      
      const handleLoaded = () => {
        console.log("Video loaded successfully");
        setVideoLoaded(true);
        setVideoError(false);
        
        // Try to play the video automatically
        video.play().catch(err => {
          console.error("Autoplay failed:", err);
          // Even if autoplay fails, the video is still loaded
          setVideoLoaded(true);
        });
      };
      
      // Add event listeners
      video.addEventListener('error', handleError);
      video.addEventListener('loadeddata', handleLoaded);
      
      // Set timeout for loading message
      const timeout = setTimeout(() => {
        if (!videoLoaded && isOpen) {
          setLoadingMessage("Still loading video... This may take a moment.");
        }
      }, 5000);
      
      return () => {
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadeddata', handleLoaded);
        clearTimeout(timeout);
      };
    }
  }, [videoURL, isOpen, videoLoaded]);
  
  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      // Prevent scrolling when modal is open
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="relative w-11/12 h-4/5 max-w-4xl bg-black rounded-lg overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between p-3 bg-gray-900">
          <h3 className="text-white font-medium">{title}</h3>
          <button 
            onClick={onClose}
            className="p-1 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        
        {/* Video container */}
        <div className="relative w-full h-[calc(100%-48px)]">
          {/* Loading state */}
          {!videoLoaded && !videoError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
              <div className="text-white text-sm">{loadingMessage}</div>
            </div>
          )}
          
          {/* Error state */}
          {videoError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
              <div className="text-red-500 mb-2">Error loading video</div>
              <button 
                onClick={() => {
                  setVideoError(false);
                  if (videoRef.current && videoURL) {
                    videoRef.current.load();
                  }
                }}
                className="px-3 py-1 bg-primary text-primary-foreground rounded-full text-sm"
              >
                Try Again
              </button>
            </div>
          )}
          
          {/* Video element */}
          {videoURL && (
            <video 
              ref={videoRef}
              src={videoURL}
              className="w-full h-full object-contain"
              controls
              autoPlay
              preload="auto"
              playsInline
              onCanPlay={() => setVideoLoaded(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoModal; 