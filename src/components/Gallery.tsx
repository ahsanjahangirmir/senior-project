
import React from 'react';
import { usePCD } from '@/context/PCDContext';
import { DrivingSequence } from '@/lib/types';

export const Gallery: React.FC = () => {
  const { sequences, selectedSequence, selectSequence } = usePCD();

  return (
    <div className="h-full flex flex-col animate-fade-in">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-medium">Driving Sequences</h2>
        <p className="text-sm text-muted-foreground">Select a sequence to analyze</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {sequences.map((sequence, index) => (
          <GalleryItem 
            key={sequence.id} 
            sequence={sequence} 
            isActive={selectedSequence?.id === sequence.id}
            onSelect={() => selectSequence(sequence)}
            delay={index}
          />
        ))}
      </div>
    </div>
  );
};

interface GalleryItemProps {
  sequence: DrivingSequence;
  isActive: boolean;
  onSelect: () => void;
  delay: number;
}

const GalleryItem: React.FC<GalleryItemProps> = ({ sequence, isActive, onSelect, delay }) => {
  return (
    <div 
      className={`gallery-item cursor-pointer transition-all duration-200 border rounded-lg overflow-hidden ${isActive ? 'ring-2 ring-primary' : 'hover:bg-accent/50'}`} 
      style={{ animationDelay: `${delay * 100}ms` }}
      onClick={onSelect}
    >
      <div className="aspect-video bg-muted/50 relative overflow-hidden">
        <img 
          src={sequence.thumbnail} 
          alt={sequence.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-3 glass">
        <h3 className="font-medium text-sm">{sequence.name}</h3>
        {sequence.date && (
          <span className="text-xs text-muted-foreground block mt-1">{sequence.date}</span>
        )}
      </div>
    </div>
  );
};

export default Gallery;
