import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { Landmark, DetectionResult } from '../types';
import { SignalingService } from '../services/signalingService';
import { RefreshCw, AlertCircle, Camera, Settings2, Activity, Cast } from 'lucide-react';

interface FaceDetectorProps {
  onStatsUpdate: (type: 'NOD' | 'SHAKE') => void;
}

const FaceDetector: React.FC<FaceDetectorProps> = ({ onStatsUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  
  // Tunable Parameters
  const [sensitivity, setSensitivity] = useState(0.5); // 0.1 (Hard) to 1.0 (Easy)

  // Live Debug Stats
  const [debugStats, setDebugStats] = useState({ ampY: 0, ampX: 0, osc: 0 });
  
  // Refs for gesture logic
  const lastGestureTimeRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const noseHistoryRef = useRef<{x: number, y: number, time: number}[]>([]);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;

    // 1. Initialize Network Host
    SignalingService.initHost()
        .then(code => {
            if(mounted) setRoomCode(code);
        })
        .catch(err => {
            console.error("Network Init Failed", err);
            if(mounted) setError("Network initialization failed. Check internet.");
        });

    // 2. Initialize AI
    const setupMediaPipe = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        if (!mounted) return;

        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: false,
          runningMode: "VIDEO",
          numFaces: 1
        });

        landmarkerRef.current = landmarker;
        setIsLoaded(true);
        startCamera();
      } catch (err) {
        console.error(err);
        if (mounted) setError("Failed to load AI models.");
      }
    };

    setupMediaPipe();

    return () => {
      mounted = false;
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (landmarkerRef.current) landmarkerRef.current.close();
      SignalingService.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', predictWebcam);
      }
    } catch (err) {
      console.error(err);
      setError("Camera permission denied or camera in use.");
    }
  };

  const detectNod = (landmarks: Landmark[]) => {
    // Index 1 is the nose tip
    const noseTip = landmarks[1];
    const now = Date.now();

    // Add to history
    noseHistoryRef.current.push({ x: noseTip.x, y: noseTip.y, time: now });
    // Keep last 1 second of data ("son 1 saniyede")
    noseHistoryRef.current = noseHistoryRef.current.filter(p => now - p.time < 1000);

    // Need enough data points
    if (noseHistoryRef.current.length < 5) return;

    // --- ALGORITHM: 6. GÜN İNCE AYAR ---
    
    // 1. Calculate Amplitudes
    const ys = noseHistoryRef.current.map(p => p.y);
    const xs = noseHistoryRef.current.map(p => p.x);
    
    const rangeY = Math.max(...ys) - Math.min(...ys);
    const rangeX = Math.max(...xs) - Math.min(...xs);

    // Dynamic Threshold based on sensitivity slider
    // High sensitivity (1.0) -> Low threshold (0.02)
    // Low sensitivity (0.1) -> High threshold (0.08)
    const THRESHOLD_Y = 0.08 - (sensitivity * 0.06); 

    // 2. Count direction changes (Oscillations)
    let directionChanges = 0;
    let lastDirection = 0; 
    
    for (let i = 1; i < noseHistoryRef.current.length; i++) {
        const delta = noseHistoryRef.current[i].y - noseHistoryRef.current[i-1].y;
        if (Math.abs(delta) > 0.002) { 
            const currentDirection = Math.sign(delta);
            if (lastDirection !== 0 && currentDirection !== lastDirection) {
                directionChanges++;
            }
            lastDirection = currentDirection;
        }
    }

    // UPDATE DEBUG STATS (For UI)
    if (showDebug && now % 10 === 0) { // Throttle updates
        setDebugStats({
            ampY: parseFloat(rangeY.toFixed(3)),
            ampX: parseFloat(rangeX.toFixed(3)),
            osc: directionChanges
        });
    }

    // --- DETECTION LOGIC ---

    // Rule 1: Must have significant vertical movement (Amplitude Y)
    const hasVerticalMovement = rangeY > THRESHOLD_Y;

    // Rule 2: Must oscillate (Up-Down-Up)
    const hasOscillation = directionChanges >= 3;

    // Rule 3: Horizontal Stabilization (The "Look Around" Filter)
    // If we are moving X almost as much as Y, it's not a clear nod.
    // Allow X movement up to 60% of Y movement.
    const isStable = rangeX < (rangeY * 0.6);

    if (hasVerticalMovement && hasOscillation && isStable) { 
       // Debounce (1.5s)
       if (now - lastGestureTimeRef.current > 1500) {
          lastGestureTimeRef.current = now;
          
          // Action
          onStatsUpdate('NOD');
          SignalingService.broadcast('NOD');
          
          setFeedback("ONAYLIYOR");
          setTimeout(() => setFeedback(null), 1000);
          
          // Clear history
          noseHistoryRef.current = [];
       }
    }
  };

  const predictWebcam = () => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (video && landmarker) {
      if (!video.paused && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const result: DetectionResult = landmarker.detectForVideo(video, performance.now());
          if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            detectNod(result.faceLandmarks[0]);
          }
        } catch (e) {
          console.warn("Detection error:", e);
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    <div className="relative w-full max-w-md aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 group">
      {!isLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <span className="ml-3">Loading AI Vision...</span>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-zinc-950 p-6 text-center z-20">
          <AlertCircle className="w-12 h-12 mb-3 opacity-80" />
          <p className="mb-4 font-bold">{error}</p>
          <button 
            onClick={startCamera}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg transition-colors font-mono text-sm"
          >
            <Camera size={16} />
            RETRY CAMERA
          </button>
        </div>
      )}
      
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover transform -scale-x-100 opacity-80" 
      />
      
      {/* Live Indicator */}
      <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur px-3 py-1 rounded-full flex items-center gap-2 text-xs font-mono text-green-400 border border-green-500/30">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        LIVE TRACKING
      </div>

       {/* Room Code Indicator (Vital for Mobile Connection) */}
       {roomCode && (
        <div className="absolute bottom-4 right-4 bg-zinc-100 text-black px-4 py-2 rounded-xl flex items-center gap-3 shadow-lg animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-black/10 p-1 rounded">
                <Cast size={18} />
            </div>
            <div className="flex flex-col leading-none">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Room Code</span>
                <span className="text-xl font-black font-mono tracking-widest">{roomCode}</span>
            </div>
        </div>
       )}

      {/* Settings Toggle */}
      <button 
        onClick={() => setShowDebug(!showDebug)}
        className="absolute top-4 right-4 bg-black/60 p-2 rounded-full text-zinc-400 hover:text-white transition-colors"
      >
        <Settings2 size={16} />
      </button>

      {/* Debug & Fine Tuning Panel */}
      {showDebug && (
        <div className="absolute top-4 left-4 bg-black/80 backdrop-blur border border-zinc-700 p-4 rounded-xl text-xs font-mono w-48 shadow-xl">
            <div className="flex items-center gap-2 text-zinc-400 mb-3 border-b border-zinc-700 pb-2">
                <Activity size={14} />
                <span>FINE TUNE</span>
            </div>

            <div className="mb-4">
                <label className="block text-zinc-500 mb-1">Sensitivity ({sensitivity.toFixed(1)})</label>
                <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={sensitivity}
                    onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                    className="w-full accent-green-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                    <span>Strict</span>
                    <span>Easy</span>
                </div>
            </div>

            <div className="space-y-1">
                <div className="flex justify-between">
                    <span className="text-zinc-500">Vert Move:</span>
                    <span className={debugStats.ampY > (0.08 - sensitivity * 0.06) ? 'text-green-400' : 'text-zinc-400'}>
                        {debugStats.ampY.toFixed(3)}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-zinc-500">Horiz Noise:</span>
                    <span className={debugStats.ampX < debugStats.ampY * 0.6 ? 'text-zinc-400' : 'text-red-400'}>
                        {debugStats.ampX.toFixed(3)}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-zinc-500">Oscillations:</span>
                    <span className={debugStats.osc >= 3 ? 'text-green-400' : 'text-zinc-400'}>
                        {debugStats.osc}
                    </span>
                </div>
            </div>
        </div>
      )}

      {/* Feedback Overlay */}
      {feedback && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-green-500 text-black px-8 py-4 rounded-2xl text-3xl font-black tracking-tighter shadow-xl animate-bounce border-4 border-green-400">
                {feedback}
            </div>
        </div>
      )}
    </div>
  );
};

export default FaceDetector;