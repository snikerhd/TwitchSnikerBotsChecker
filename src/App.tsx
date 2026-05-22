import { useState } from 'react';
import LandingPage from './components/LandingPage';
import TrackerApp from './components/TrackerApp';

export default function App() {
  const [activeView, setActiveView] = useState<'landing' | 'app'>('landing');
  const [channelName, setChannelName] = useState('');

  const handleStartAnalysis = (channel: string) => {
    setChannelName(channel);
    setActiveView('app');
  };

  const handleBackToLanding = () => {
    setActiveView('landing');
    setChannelName('');
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white overflow-x-hidden">
      {activeView === 'landing' ? (
        <LandingPage onStartAnalysis={handleStartAnalysis} />
      ) : (
        <TrackerApp channelName={channelName} onBack={handleBackToLanding} />
      )}
    </div>
  );
}
