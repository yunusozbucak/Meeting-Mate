import React, { useState } from 'react';
import { AppMode, MeetingStats } from './types';
import FaceDetector from './components/FaceDetector';
import ClientView from './components/ClientView';
import { generateMeetingSummary } from './services/geminiService';
import { Video, Smartphone, Sparkles, ChevronRight, User, Users } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.INTRO);
  const [stats, setStats] = useState<MeetingStats>({
    nods: 0,
    shakes: 0,
    lastGestureTime: 0,
    startTime: Date.now()
  });
  const [analysis, setAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleStatsUpdate = (type: 'NOD' | 'SHAKE') => {
    setStats(prev => ({
      ...prev,
      nods: type === 'NOD' ? prev.nods + 1 : prev.nods,
      shakes: type === 'SHAKE' ? prev.shakes + 1 : prev.shakes,
      lastGestureTime: Date.now()
    }));
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    const result = await generateMeetingSummary(stats);
    setAnalysis(result);
    setIsAnalyzing(false);
  };

  if (mode === AppMode.INTRO) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-900/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />

        <div className="z-10 text-center max-w-md w-full">
          <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-500 mb-4 tracking-tighter">
            MeetingMate
          </h1>
          <p className="text-zinc-400 mb-12 text-lg">
            Silent consensus monitoring via visual AI.
          </p>

          <div className="grid gap-4">
            <button
              onClick={() => setMode(AppMode.HOST)}
              className="group relative flex items-center justify-between p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:bg-zinc-900 hover:border-zinc-700 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl group-hover:bg-purple-500 group-hover:text-white transition-colors">
                  <Video size={24} />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-zinc-100">Host Mode</h3>
                  <p className="text-xs text-zinc-500 mt-1">Camera & Detection (Laptop)</p>
                </div>
              </div>
              <ChevronRight className="text-zinc-600 group-hover:text-white transition-colors" />
            </button>

            <button
              onClick={() => setMode(AppMode.CLIENT)}
              className="group relative flex items-center justify-between p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:bg-zinc-900 hover:border-zinc-700 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <Smartphone size={24} />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-zinc-100">Participant Mode</h3>
                  <p className="text-xs text-zinc-500 mt-1">Haptic Feedback (Mobile)</p>
                </div>
              </div>
              <ChevronRight className="text-zinc-600 group-hover:text-white transition-colors" />
            </button>
          </div>
          
          <div className="mt-12 pt-8 border-t border-zinc-900 flex justify-center gap-8 text-xs text-zinc-600 font-mono">
             <span className="flex items-center gap-2"><User size={12}/> SOLO TEST</span>
             <span className="flex items-center gap-2"><Users size={12}/> TEAM SYNC</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-6 bg-black/50 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setMode(AppMode.INTRO)}>
          <div className="w-3 h-3 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full" />
          <span className="font-bold tracking-tight text-zinc-200">MeetingMate</span>
        </div>
        <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-zinc-500 bg-zinc-900 px-2 py-1 rounded">
                {mode}
            </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {mode === AppMode.CLIENT ? (
          <ClientView />
        ) : (
          <div className="max-w-4xl mx-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Live Monitor</h2>
                <p className="text-sm text-zinc-400">Position camera to detect head gestures.</p>
              </div>
              
              <FaceDetector onStatsUpdate={handleStatsUpdate} />

              <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Live Statistics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/40 p-3 rounded-lg border border-zinc-800/50">
                    <span className="text-zinc-500 text-xs">Agreements (Nods)</span>
                    <div className="text-3xl font-mono text-green-400 font-bold mt-1">{stats.nods}</div>
                  </div>
                  <div className="bg-black/40 p-3 rounded-lg border border-zinc-800/50">
                    <span className="text-zinc-500 text-xs">Disagreements</span>
                    <div className="text-3xl font-mono text-red-400 font-bold mt-1">{stats.shakes}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col h-full space-y-6">
               <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">AI Analysis</h2>
                <p className="text-sm text-zinc-400">Gemini-powered consensus summary.</p>
              </div>

              <div className="flex-1 bg-zinc-900/30 rounded-2xl border border-zinc-800 p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
                {analysis ? (
                   <div className="text-zinc-200 text-lg leading-relaxed animate-in fade-in zoom-in duration-500">
                      <Sparkles className="w-8 h-8 text-yellow-500 mx-auto mb-4" />
                      "{analysis}"
                   </div>
                ) : (
                  <div className="text-zinc-600">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Start the meeting and generate insights based on group gestures.</p>
                  </div>
                )}
                
                {/* Background Glow */}
                {analysis && <div className="absolute inset-0 bg-gradient-to-t from-purple-500/10 to-transparent pointer-events-none" />}
              </div>

              <button 
                onClick={handleAnalyze}
                disabled={isAnalyzing || (stats.nods === 0 && stats.shakes === 0)}
                className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                  isAnalyzing 
                    ? 'bg-zinc-800 text-zinc-500 cursor-wait' 
                    : 'bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/10'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isAnalyzing ? (
                  <>Processing...</>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Generate Report
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;