import React, { useEffect, useState, useRef } from 'react';
import { MicOff, CheckCircle2, XCircle, Wifi, WifiOff, Smartphone, Users, ArrowRight, Loader2 } from 'lucide-react';
import { SignalingService } from '../services/signalingService';

const ClientView: React.FC = () => {
  const [step, setStep] = useState<'LOGIN' | 'ACTIVE'>('LOGIN');
  const [roomCode, setRoomCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [gestureState, setGestureState] = useState<'IDLE' | 'AGREE' | 'DISAGREE'>('IDLE');
  const [isConnected, setIsConnected] = useState(navigator.onLine);
  const [activeNodders, setActiveNodders] = useState<Set<string>>(new Set());
  
  // Refs to track state for edge-trigger logic without re-renders
  const stateRef = useRef<'IDLE' | 'AGREE' | 'DISAGREE'>('IDLE');
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const nodderTimeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // MOCK: Expo Haptics Implementation
  const triggerHaptics = (type: 'HEAVY' | 'ERROR') => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'HEAVY') {
        navigator.vibrate(200); 
      } else if (type === 'ERROR') {
        navigator.vibrate([50, 50, 50, 50]); 
      }
    }
  };

  const handleJoin = async () => {
    if(!roomCode || roomCode.length < 4) return;
    setIsJoining(true);
    setJoinError(null);
    try {
        await SignalingService.joinSession(roomCode);
        setStep('ACTIVE');
    } catch (e) {
        setJoinError("Could not find room. Check code.");
        setIsJoining(false);
    }
  };

  useEffect(() => {
    if (step !== 'ACTIVE') return;

    // Real Network Status Monitoring
    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const cleanupSignal = SignalingService.listen((message) => {
      // 1. Multi-User Logic
      const { senderId, gesture } = message;

      setActiveNodders(prev => {
        const next = new Set(prev);
        next.add(senderId);
        return next;
      });

      if (nodderTimeoutRefs.current.has(senderId)) {
        clearTimeout(nodderTimeoutRefs.current.get(senderId)!);
      }
      const timeoutId = setTimeout(() => {
        setActiveNodders(prev => {
          const next = new Set(prev);
          next.delete(senderId);
          return next;
        });
        nodderTimeoutRefs.current.delete(senderId);
      }, 2000);
      nodderTimeoutRefs.current.set(senderId, timeoutId);


      // 2. State & Haptic Logic
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      
      if (gesture === 'NOD') {
        if (stateRef.current !== 'AGREE') {
          triggerHaptics('HEAVY');
          stateRef.current = 'AGREE';
          setGestureState('AGREE');
        }
      } else if (gesture === 'SHAKE') {
        if (stateRef.current !== 'DISAGREE') {
          triggerHaptics('ERROR');
          stateRef.current = 'DISAGREE';
          setGestureState('DISAGREE');
        }
      }

      // Reset to IDLE after silence
      idleTimerRef.current = setTimeout(() => {
        stateRef.current = 'IDLE';
        setGestureState('IDLE');
        setActiveNodders(new Set()); // Clear visual count
      }, 2000);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      nodderTimeoutRefs.current.forEach(t => clearTimeout(t));
      if (cleanupSignal) cleanupSignal();
      SignalingService.cleanup();
    };
  }, [step]);

  const getTheme = () => {
    switch (gestureState) {
      case 'AGREE': return 'bg-green-600 text-white';
      case 'DISAGREE': return 'bg-red-600 text-white';
      default: return 'bg-zinc-950 text-zinc-100';
    }
  };

  if (step === 'LOGIN') {
      return (
          <div className="h-full flex flex-col items-center justify-center p-8 bg-zinc-950 text-white">
              <div className="w-full max-w-sm space-y-8">
                  <div className="text-center space-y-2">
                      <h2 className="text-3xl font-black tracking-tighter">JOIN SESSION</h2>
                      <p className="text-zinc-500 text-sm">Enter the code displayed on the Host screen</p>
                  </div>

                  <div className="space-y-4">
                    <input 
                        type="text" 
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        placeholder="e.g. A1B2"
                        className="w-full bg-zinc-900 border border-zinc-800 text-center text-4xl font-mono p-4 rounded-xl focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all placeholder:text-zinc-800 tracking-widest uppercase"
                        maxLength={4}
                    />
                    
                    {joinError && (
                        <div className="text-red-400 text-xs text-center font-bold">{joinError}</div>
                    )}

                    <button 
                        onClick={handleJoin}
                        disabled={isJoining || roomCode.length < 4}
                        className="w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isJoining ? <Loader2 className="animate-spin" /> : <>JOIN <ArrowRight size={18} /></>}
                    </button>
                  </div>
              </div>
          </div>
      )
  }

  return (
    <div className={`h-full flex flex-col items-center justify-center p-6 transition-colors duration-300 ${getTheme()} relative overflow-hidden`}>
      
      {/* Background Pulse Effect */}
      {gestureState !== 'IDLE' && (
        <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
      )}

      {/* Connectivity Status */}
      <div className="absolute top-6 right-6 flex items-center gap-2 z-10 transition-opacity duration-300">
         {isConnected ? <Wifi size={14} /> : <WifiOff size={14} className="text-red-500" />}
         <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
         <span className={`text-[10px] font-mono uppercase tracking-widest ${isConnected ? 'opacity-60' : 'text-red-400 font-bold'}`}>
           {isConnected ? 'ONLINE' : 'OFFLINE'}
         </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm z-10">
        
        {/* Active Users Indicator (Multi-user visual) */}
        <div className={`mb-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-opacity duration-300 ${activeNodders.size > 0 ? 'opacity-100' : 'opacity-30'}`}>
            <Users size={16} />
            <span>Active Signals: {activeNodders.size}</span>
        </div>

        {/* Haptic Icon */}
        {gestureState !== 'IDLE' && (
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-80 animate-bounce">
                <Smartphone size={16} />
                <span>Haptic Active</span>
            </div>
        )}

        {/* Main Visual Indicator */}
        <div className={`
          w-64 h-64 rounded-full flex items-center justify-center mb-10 transition-all duration-500
          ${gestureState !== 'IDLE' ? 'scale-110 shadow-2xl' : 'scale-100 border-4 border-zinc-800 bg-zinc-900'}
          ${gestureState === 'AGREE' ? 'bg-white text-green-600 shadow-green-900/50' : ''}
          ${gestureState === 'DISAGREE' ? 'bg-white text-red-600 shadow-red-900/50' : ''}
        `}>
          {gestureState === 'IDLE' && <MicOff className="w-24 h-24 text-zinc-700" />}
          {gestureState === 'AGREE' && <CheckCircle2 className="w-32 h-32 animate-bounce" />}
          {gestureState === 'DISAGREE' && <XCircle className="w-32 h-32 animate-pulse" />}
        </div>

        {/* Primary Text */}
        <h1 className="text-5xl md:text-6xl font-black tracking-tighter uppercase transition-all text-center">
          {gestureState === 'IDLE' && 'SESSİZ'}
          {gestureState === 'AGREE' && 'ONAYLAMA'}
          {gestureState === 'DISAGREE' && 'RED'}
        </h1>
        
        {/* Subtitle */}
        <p className="mt-4 opacity-70 font-mono text-sm tracking-wide">
           {gestureState === 'IDLE' ? 'WAITING FOR GROUP...' : 'CONSENSUS REACHED'}
        </p>
      </div>

      <div className="mt-auto mb-4 text-center opacity-30 text-[10px] uppercase tracking-widest max-w-[200px]">
        Room: {roomCode}<br/>Keep app open
      </div>
    </div>
  );
};

export default ClientView;