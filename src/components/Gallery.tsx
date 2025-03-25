
import React from 'react';
import { usePCD } from '@/context/PCDContext';
import { PCDItem } from '@/lib/types';

export const Gallery: React.FC = () => {
  const { pcds, selectedPCD, selectPCD } = usePCD();

  return (
    <div className="h-full flex flex-col animate-fade-in">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-medium">Point Cloud Gallery</h2>
        <p className="text-sm text-muted-foreground">Select a point cloud to analyze</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {pcds.map((pcd, index) => (
          <GalleryItem 
            key={pcd.id} 
            pcd={pcd} 
            isActive={selectedPCD?.id === pcd.id}
            onSelect={() => selectPCD(pcd)}
            delay={index}
          />
        ))}
      </div>
    </div>
  );
};

interface GalleryItemProps {
  pcd: PCDItem;
  isActive: boolean;
  onSelect: () => void;
  delay: number;
}

const GalleryItem: React.FC<GalleryItemProps> = ({ pcd, isActive, onSelect, delay }) => {
  return (
    <div 
      className={`gallery-item animate-fade-in ${isActive ? 'active' : ''}`} 
      style={{ animationDelay: `${delay * 100}ms` }}
      onClick={onSelect}
    >
      <div className="aspect-video bg-muted/50 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <span className="text-xs">Point Cloud Preview</span>
        </div>
        <img 
          src={pcd.thumbnail} 
          alt={pcd.name}
          className="w-full h-full object-cover opacity-30"
        />
      </div>
      <div className="p-3 glass">
        <h3 className="font-medium text-sm">{pcd.name}</h3>
        {pcd.date && (
          <span className="text-xs text-muted-foreground block mt-1">{pcd.date}</span>
        )}
      </div>
    </div>
  );
};

export default Gallery;
