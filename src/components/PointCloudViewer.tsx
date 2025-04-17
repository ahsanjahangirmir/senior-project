
import React from 'react';
import { DrivingSequence } from '@/lib/types';
import { ArrowUp, Play } from 'lucide-react';
import { usePCD } from '@/context/PCDContext';

interface PointCloudViewerProps {
  sequence: DrivingSequence | null;
}

const PointCloudViewer: React.FC<PointCloudViewerProps> = ({ sequence }) => {
  const { openVideoViewer } = usePCD();
  
  if (!sequence) {
    return (
      <div className="pcd-viewer h-full relative flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Select a driving sequence from the gallery</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pcd-viewer h-full relative">
      <div className="absolute inset-0">
        <img 
          src={sequence.thumbnail}
          alt={`Thumbnail of ${sequence.name}`}
          className="w-full h-full object-contain"
        />
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 p-3 glass">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">{sequence.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{sequence.description || "Driving sequence"}</p>
          </div>
          <button 
            onClick={() => sequence && openVideoViewer(sequence)}
            className="bg-primary text-primary-foreground px-3 py-1 text-xs rounded-full flex items-center"
          >
            <Play size={12} className="mr-1" />
            View Video
          </button>
        </div>
      </div>
    </div>
  );
};

export default PointCloudViewer;
