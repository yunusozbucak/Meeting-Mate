import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { Landmark, DetectionResult } from '../types';
import { SignalingService } from '../services/signalingService';
import { RefreshCw, AlertCircle, Settings2, Activity, Cast, Mic, MicOff, Camera, Video, Check, X } from 'lucide-react';

interface FaceDetectorProps {
  onStatsUpdate: (type: 'NOD' | 'SHAKE') => void;
}

// Expose methods to parent via Ref
export interface FaceDetectorHandle {
  stopAndGetAudio: () => Promise<string | undefined>;
}

const FaceDetector = forwardRef<FaceDetectorHandle, FaceDetectorProps>(({ onStatsUpdate }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{msg: string, type: 'NOD' | 'SHAKE'} | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  
  // Tunable Parameters
  // 0.0 = Hard to trigger, 1.0 = Very sensitive
  const [sensitivity, setSensitivity] = useState(0.6); 

  // Live Debug Stats
  const [debugStats, setDebugStats] = useState({ ampY: 0, ampX: 0, oscY: 0, oscX: 0 });
  
  // Refs
  const lastGestureTimeRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  // Map<TrackingID, HistoryArray>
  const faceHistoriesRef = useRef<Map<number, {x: number, y: number, time: number}[]>>(new Map());
  const requestRef = useRef<number>(0);
  
  // Audio Recording Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Expose audio retrieval to parent (App.tsx)
  useImperativeHandle(ref, () => ({
    stopAndGetAudio: async () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
            return undefined;
        }

        return new Promise((resolve) => {
            if (!mediaRecorderRef.current) return resolve(undefined);

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64String = reader.result as string;
                    // Remove data url prefix
                    const base64Data = base64String.split(',')[1];
                    resolve(base64Data);
                };
            };
            mediaRecorderRef.current.stop();
        });
    }
  }));

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
          numFaces: 1 // Optimization: Just need the host
        });

        landmarkerRef.current = landmarker;
        setIsLoaded(true);
      } catch (err) {
        console.error(err);
        if (mounted) setError("Failed to load AI models.");
      }
    };

    setupMediaPipe();

    return () => {
      mounted = false;
      stopCapture();
      if (landmarkerRef.current) landmarkerRef.current.close();
      SignalingService.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start camera when loaded
  useEffect(() => {
    if (isLoaded && !isCameraActive && !error) {
       // Attempt auto-start, pass true to suppress UI error on fail
       startCamera(true);
    }
  }, [isLoaded]);

  const stopCapture = () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
      }
      setIsCameraActive(false);
      setHasAudio(false);
  };

  const startCamera = async (isAutoStart = false) => {
    setError(null);
    try {
      let stream: MediaStream;
      
      try {
        // Try Video + Audio first
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480 },
            audio: true 
        });
        setHasAudio(true);
      } catch (audioErr) {
        console.warn("Audio/Video permission failed, retrying Video only", audioErr);
        // Fallback: Video Only
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480 },
            audio: false 
        });
        setHasAudio(false);
      }

      // If we got here, we have a stream.
      // 1. Setup Audio Recorder (if tracks exist)
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
          setHasAudio(true); // Re-confirm in case fallback wasn't needed
          audioChunksRef.current = [];
          const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          recorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                  audioChunksRef.current.push(event.data);
              }
          };
          recorder.start(1000); // Collect chunks every second
          mediaRecorderRef.current = recorder;
      }

      // 2. Setup Video
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', predictWebcam);
      }
      
      setIsCameraActive(true);

    } catch (err) {
      console.error(err);
      if (!isAutoStart) {
          // Only show fatal error if user explicitly clicked the button.
          // On auto-start fail, we stay on the "Start Monitoring" screen.
          setError("Camera access denied. Please check site permissions.");
      }
    }
  };

  const detectGesture = (landmarks: Landmark[], faceId: number) => {
    const noseTip = landmarks[1];
    const now = Date.now();

    // 1. GLOBAL DEBOUNCE: Don't check if we just triggered an action recently
    // Wait 500ms before accepting a new gesture
    if (now - lastGestureTimeRef.current < 500) return;

    // Init history for this face
    if (!faceHistoriesRef.current.has(faceId)) {
        faceHistoriesRef.current.set(faceId, []);
    }
    const history = faceHistoriesRef.current.get(faceId)!;

    // Add to history
    history.push({ x: noseTip.x, y: noseTip.y, time: now });
    
    // Maintain 1.5 seconds of history for analysis (was 1.2s)
    const freshHistory = history.filter(p => now - p.time < 1500);
    faceHistoriesRef.current.set(faceId, freshHistory);

    // Need at least 10 frames (~300ms) to detect movement
    if (freshHistory.length < 10) return;

    // Calculate Amplitudes (Range)
    const ys = freshHistory.map(p => p.y);
    const xs = freshHistory.map(p => p.x);
    const rangeY = Math.max(...ys) - Math.min(...ys);
    const rangeX = Math.max(...xs) - Math.min(...xs);

    // Dynamic Thresholds
    // Sensitivity 0.0 -> Threshold 0.08 (Needs big movement)
    // Sensitivity 1.0 -> Threshold 0.02 (Needs small movement)
    const BASE_THRESHOLD = 0.08 - (sensitivity * 0.06); 
    const THRESHOLD_Y = BASE_THRESHOLD;
    const THRESHOLD_X = BASE_THRESHOLD;

    // Count Oscillations (Direction Changes)
    let oscY = 0; let lastDirY = 0;
    let oscX = 0; let lastDirX = 0;
    
    // Jitter threshold: movement must be larger than this to count as a "move"
    const JITTER = 0.005; 

    for (let i = 1; i < freshHistory.length; i++) {
        const deltaY = freshHistory[i].y - freshHistory[i-1].y;
        if (Math.abs(deltaY) > JITTER) { 
            const currentDirY = Math.sign(deltaY);
            if (lastDirY !== 0 && currentDirY !== lastDirY) oscY++;
            lastDirY = currentDirY;
        }

        const deltaX = freshHistory[i].x - freshHistory[i-1].x;
        if (Math.abs(deltaX) > JITTER) {
            const currentDirX = Math.sign(deltaX);
            if (lastDirX !== 0 && currentDirX !== lastDirX) oscX++;
            lastDirX = currentDirX;
        }
    }

    // UPDATE DEBUG STATS
    if (showDebug && faceId === 0 && now % 10 === 0) { 
        setDebugStats({
            ampY: parseFloat(rangeY.toFixed(3)),
            ampX: parseFloat(rangeX.toFixed(3)),
            oscY: oscY,
            oscX: oscX
        });
    }

    // --- DECISION LOGIC ---
    // NOD: Needs vertical movement, at least 1 direction change (Down-Up), and Vertical > Horizontal
    const isNod = rangeY > THRESHOLD_Y && oscY >= 1 && rangeY > (rangeX * 1.25);
    
    // SHAKE: Needs horizontal movement, at least 1 direction change (Left-Right), and Horizontal > Vertical
    const isShake = rangeX > THRESHOLD_X && oscX >= 1 && rangeX > (rangeY * 1.25);

    if (isNod) {
        triggerAction('NOD');
    } else if (isShake) {
        triggerAction('SHAKE');
    }
  };

  const triggerAction = (type: 'NOD' | 'SHAKE') => {
      // Double check debounce just in case
      if (Date.now() - lastGestureTimeRef.current < 500) return;

      lastGestureTimeRef.current = Date.now();
      
      // Call Parent
      onStatsUpdate(type);
      
      // Broadcast to network
      SignalingService.broadcast(type);
      
      // Visual feedback - English text
      setFeedback({
          msg: type === 'NOD' ? "AGREEMENT" : "DISAGREEMENT",
          type: type
      });
      setTimeout(() => setFeedback(null), 1500);
      
      // Clear histories to prevent immediate re-triggering based on old frames
      faceHistoriesRef.current.clear();
  };

  const predictWebcam = () => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (video && landmarker) {
      if (!video.paused && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        
        try {
          const result: DetectionResult = landmarker.detectForVideo(video, performance.now());
          
          if (result.faceLandmarks) {
              result.faceLandmarks.forEach((landmarks, index) => {
                  detectGesture(landmarks, index);
              });
          }
        } catch (e) {
          console.warn("Detection error:", e);
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    <div className="relative w-full max-w-md aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 group mx-auto">
      {!isLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <span className="ml-3">Loading Vision Engine...</span>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-zinc-950 p-6 text-center z-20">
          <AlertCircle className="w-10 h-10 mb-3 opacity-80" />
          <p className="mb-4 font-bold text-sm">{error}</p>
          <button 
                onClick={() => startCamera(false)}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg transition-colors font-mono text-sm"
            >
                <Camera size={16} />
                RETRY CAMERA
            </button>
        </div>
      )}
      
      {/* Start Button Overlay (Only if not active and loaded) */}
      {isLoaded && !isCameraActive && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 z-10 backdrop-blur-sm">
             <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 text-center max-w-xs">
                <Video className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                <h3 className="text-white font-bold text-lg mb-2">Camera Access</h3>
                <p className="text-zinc-400 text-xs mb-6">Enable camera to detect your gestures and record audio for analysis.</p>
                <button 
                    onClick={() => startCamera(false)}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold transition-all active:scale-95"
                >
                    START MONITORING
                </button>
             </div>
        </div>
      )}
      
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted // Muted locally to avoid feedback loop
        className="w-full h-full object-cover transform -scale-x-100" // Mirror effect for natural feel
      />
      
      {/* Live Indicator */}
      {isCameraActive && (
        <div className="absolute bottom-4 left-4 flex gap-2">
            <div className="bg-black/60 backdrop-blur px-3 py-1 rounded-full flex items-center gap-2 text-xs font-mono text-green-400 border border-green-500/30">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                LIVE
            </div>
            
            <div className={`bg-black/60 backdrop-blur px-3 py-1 rounded-full flex items-center gap-2 text-xs font-mono border ${hasAudio ? 'text-blue-400 border-blue-500/30' : 'text-zinc-500 border-zinc-700'}`}>
                {hasAudio ? <Mic size={12} /> : <MicOff size={12} />}
            </div>
        </div>
      )}

       {/* Room Code Indicator */}
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
        className="absolute top-4 right-4 bg-black/60 p-2 rounded-full text-zinc-400 hover:text-white transition-colors z-20"
      >
        <Settings2 size={16} />
      </button>

      {/* Debug & Fine Tuning Panel */}
      {showDebug && (
        <div className="absolute top-4 left-4 bg-black/80 backdrop-blur border border-zinc-700 p-4 rounded-xl text-xs font-mono w-48 shadow-xl z-20">
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
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <span className="text-zinc-500">Amp Y:</span>
                <span className={debugStats.ampY > (0.08 - sensitivity * 0.06) ? 'text-green-400' : 'text-zinc-400'}>
                    {debugStats.ampY.toFixed(3)}
                </span>

                <span className="text-zinc-500">Osc Y:</span>
                <span className={debugStats.oscY >= 1 ? 'text-green-400' : 'text-zinc-400'}>
                    {debugStats.oscY}
                </span>

                <span className="text-zinc-500">Amp X:</span>
                <span className={debugStats.ampX > (0.08 - sensitivity * 0.06) ? 'text-red-400' : 'text-zinc-400'}>
                    {debugStats.ampX.toFixed(3)}
                </span>
                
                <span className="text-zinc-500">Osc X:</span>
                <span className={debugStats.oscX >= 1 ? 'text-red-400' : 'text-zinc-400'}>
                    {debugStats.oscX}
                </span>
            </div>
        </div>
      )}

      {/* Professional Feedback Overlay */}
      {feedback && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className={`
                flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md border shadow-lg transition-all transform animate-in fade-in slide-in-from-top-4
                ${feedback.type === 'NOD' 
                    ? 'bg-green-500/20 border-green-500/50 text-green-400' 
                    : 'bg-red-500/20 border-red-500/50 text-red-400'}
            `}>
                {feedback.type === 'NOD' ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}
                <span className="text-xs font-bold tracking-widest uppercase">{feedback.msg}</span>
            </div>
        </div>
      )}
    </div>
  );
});

export default FaceDetector;