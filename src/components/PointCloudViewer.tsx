
import React from 'react';
import { PCDItem } from '@/lib/types';

interface PointCloudViewerProps {
  pcd: PCDItem | null;
}

// This is a placeholder component for rendering point clouds
// In a real implementation, you would use a library like Three.js or a specialized PCD renderer
const PointCloudViewer: React.FC<PointCloudViewerProps> = ({ pcd }) => {
  if (!pcd) {
    return (
      <div className="pcd-viewer flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Select a point cloud from the gallery</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pcd-viewer">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">
          PCD Visualization Placeholder
        </div>
      </div>
      
      {/* Placeholder visualization - in a real app, this would be replaced with actual 3D rendering */}
      <div className="grid grid-cols-12 grid-rows-12 w-full h-full">
        {Array.from({ length: 144 }).map((_, i) => (
          <div 
            key={i}
            className="aspect-square"
            style={{
              backgroundColor: `rgba(${Math.random() * 100 + 100}, ${Math.random() * 100 + 100}, ${Math.random() * 255}, ${Math.random() * 0.5 + 0.1})`,
              opacity: Math.random() * 0.7 + 0.3,
            }}
          />
        ))}
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 p-3 glass">
        <h3 className="text-sm font-medium">{pcd.name}</h3>
        {pcd.description && (
          <p className="text-xs text-muted-foreground mt-1">{pcd.description}</p>
        )}
      </div>
    </div>
  );
};

export default PointCloudViewer;
