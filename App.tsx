
import React, { useState, useRef } from 'react';
import { AppMode, MeetingStats, AnalysisResult } from './types';
import FaceDetector, { FaceDetectorHandle } from './components/FaceDetector';
import ClientView from './components/ClientView';
import { generateMeetingSummary } from './services/geminiService';
import { Video, Smartphone, Sparkles, ChevronRight, User, Users, MessageSquare, Lightbulb, Activity, Quote, Camera } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.INTRO);
  const [stats, setStats] = useState<MeetingStats>({
    nods: 0,
    shakes: 0,
    lastGestureTime: 0,
    startTime: Date.now()
  });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Ref to access FaceDetector methods (specifically audio retrieval)
  const faceDetectorRef = useRef<FaceDetectorHandle>(null);

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
    setAnalysis(null);
    
    // 1. Get Audio Recording from FaceDetector
    let audioBase64: string | undefined;
    if (faceDetectorRef.current) {
        audioBase64 = await faceDetectorRef.current.stopAndGetAudio();
    }

    // 2. Generate Analysis with Video Stats + Audio
    const result = await generateMeetingSummary(stats, audioBase64);
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
                  <p className="text-xs text-zinc-500 mt-1">Camera Analysis (Laptop)</p>
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
          <div className="max-w-4xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* LEFT COLUMN: MONITORING */}
            <div className="space-y-6">
              
              {/* Instructions Panel */}
              <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
                <div className="flex items-start gap-4">
                   <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400">
                      <Camera size={20} />
                   </div>
                   <div>
                      <h3 className="font-bold text-white text-sm">Step 1: Enable Camera</h3>
                      <p className="text-xs text-zinc-400 mt-1">Allow permissions to start monitoring gestures automatically.</p>
                   </div>
                </div>
                 <div className="flex items-start gap-4 border-t border-zinc-800 pt-4">
                   <div className="bg-green-500/20 p-2 rounded-lg text-green-400">
                      <Activity size={20} />
                   </div>
                   <div>
                      <h3 className="font-bold text-white text-sm">Step 2: Start Meeting</h3>
                      <p className="text-xs text-zinc-400 mt-1">The AI will track your nods (agreements) and shakes (disagreements).</p>
                   </div>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Live Monitor</h2>
                <p className="text-sm text-zinc-400">AI gesture detection active.</p>
              </div>
              
              <FaceDetector ref={faceDetectorRef} onStatsUpdate={handleStatsUpdate} />

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

            {/* RIGHT COLUMN: AI INSIGHTS */}
            <div className="flex flex-col h-full space-y-6">
               <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">AI Analysis</h2>
                <p className="text-sm text-zinc-400">Multimodal (Video + Audio) behavioral report.</p>
              </div>

              <div className="flex-1 bg-zinc-900/30 rounded-2xl border border-zinc-800 p-6 flex flex-col relative overflow-hidden min-h-[400px]">
                {analysis ? (
                   <div className="flex-1 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                      
                      {/* Summary Section */}
                      <div className="bg-black/40 p-4 rounded-xl border-l-4 border-purple-500">
                        <div className="flex items-center gap-2 mb-2 text-purple-400">
                            <Sparkles size={16} />
                            <h3 className="font-bold text-sm uppercase tracking-wider">Summary</h3>
                        </div>
                        <p className="text-zinc-200 text-sm leading-relaxed">{analysis.summary}</p>
                      </div>

                       {/* Key Quotes Section */}
                       <div className="bg-black/40 p-4 rounded-xl border-l-4 border-pink-500">
                        <div className="flex items-center gap-2 mb-2 text-pink-400">
                            <Quote size={16} />
                            <h3 className="font-bold text-sm uppercase tracking-wider">Key Quotes</h3>
                        </div>
                        <ul className="space-y-2">
                            {analysis.keyQuotes.map((quote, idx) => (
                                <li key={idx} className="text-zinc-300 text-sm italic border-l-2 border-zinc-700 pl-2">"{quote}"</li>
                            ))}
                        </ul>
                      </div>

                      {/* Expression Quality Section */}
                      <div className="bg-black/40 p-4 rounded-xl border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2 text-blue-400">
                            <MessageSquare size={16} />
                            <h3 className="font-bold text-sm uppercase tracking-wider">Expression & Tone</h3>
                        </div>
                        <p className="text-zinc-200 text-sm leading-relaxed">{analysis.expressionQuality}</p>
                      </div>

                      {/* Insight Section */}
                      <div className="bg-black/40 p-4 rounded-xl border-l-4 border-yellow-500">
                         <div className="flex items-center gap-2 mb-2 text-yellow-400">
                            <Lightbulb size={16} />
                            <h3 className="font-bold text-sm uppercase tracking-wider">Result-Oriented Insight</h3>
                        </div>
                        <p className="text-zinc-200 text-sm leading-relaxed">{analysis.insight}</p>
                      </div>

                   </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-600">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="max-w-xs">Start the camera monitoring to record gestures and audio, then generate a comprehensive report.</p>
                  </div>
                )}
                
                {/* Background Glow */}
                {analysis && <div className="absolute inset-0 bg-gradient-to-t from-purple-500/5 to-transparent pointer-events-none" />}
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
                  <>Processing Video & Audio...</>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Stop & Generate Report
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
