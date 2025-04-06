
import React from 'react';
import { PCDItem } from '@/lib/types';
import { ArrowUp } from 'lucide-react';
import { usePCD } from '@/context/PCDContext';

interface PointCloudViewerProps {
  pcd: PCDItem | null;
}

const PointCloudViewer: React.FC<PointCloudViewerProps> = ({ pcd }) => {
  const { openPCDViewer } = usePCD();
  
  if (!pcd) {
    return (
      <div className="pcd-viewer h-full relative flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Select a point cloud from the gallery</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pcd-viewer h-full relative">
      <div className="absolute inset-0">
        <img 
          src={pcd.projectionPath}
          alt={`Projection of ${pcd.name}`}
          className="w-full h-full object-contain"
        />
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 p-3 glass">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">{pcd.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{pcd.description}</p>
          </div>
          <button 
            onClick={() => openPCDViewer(pcd)}
            className="bg-primary text-primary-foreground px-3 py-1 text-xs rounded-full flex items-center"
          >
            <ArrowUp size={12} className="mr-1" />
            View 3D
          </button>
        </div>
      </div>
    </div>
  );
};

export default PointCloudViewer;
