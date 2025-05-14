import React from 'react';
import Gallery from '@/components/Gallery';
import ChatInterface from '@/components/ChatInterface';

const Index: React.FC = () => {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="p-4 border-b border-border glass">
        <div className="container mx-auto flex items-center justify-between">
          <h1 className="text-xl font-medium">LLM Guided 3D Road Scene Analysis</h1>
          <div className="text-sm text-muted-foreground">
            Developed by Ahsan Mir, Aazen Saleem, and Abdulhaseeb Khan
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Gallery Section */}
        <div className="md:w-1/3 lg:w-1/4 border-r border-border h-full">
          <Gallery />
        </div>
        
        {/* Chat Interface Section */}
        <div className="flex-1 h-full">
          <ChatInterface />
        </div>
      </main>
    </div>
  );
};

export default Index;