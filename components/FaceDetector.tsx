import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { Landmark, DetectionResult } from '../types';
import { SignalingService } from '../services/signalingService';
import { RefreshCw, AlertCircle, Settings2, Activity, Cast, Mic, MicOff, Camera, Video, Check, X, ShieldAlert } from 'lucide-react';

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
  const [error, setError] = useState<{title: string, msg: string, details?: string} | null>(null);
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
            // Non-fatal, just log
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
        if (mounted) setError({ title: "AI Engine Failed", msg: "Failed to load computer vision models." });
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
    
    // Security Check
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setError({
            title: "HTTPS Required",
            msg: "Camera access requires a secure connection. Please verify your URL starts with https://"
        });
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError({
            title: "Unsupported Browser",
            msg: "Your browser does not support camera access APIs."
        });
        return;
    }

    try {
      let stream: MediaStream;
      
      // STRATEGY 1: Ideal Configuration (Audio + Video + Constraints)
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 }, 
                height: { ideal: 480 },
                facingMode: "user"
            },
            audio: true 
        });
        setHasAudio(true);
      } catch (err1) {
        console.warn("Strategy 1 failed (Audio+Video), trying Strategy 2 (Video Only)", err1);
        
        // STRATEGY 2: Video Only (Constraints)
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    facingMode: "user" 
                },
                audio: false 
            });
            setHasAudio(false);
        } catch (err2) {
             console.warn("Strategy 2 failed (Video Constraints), trying Strategy 3 (Bare Minimum)", err2);
             
             // STRATEGY 3: Last Resort (Any Video Source)
             // This fixes "OverconstrainedError" on devices that don't match 640x480 or 'user' facing mode
             stream = await navigator.mediaDevices.getUserMedia({ 
                video: true,
                audio: false
            });
            setHasAudio(false);
        }
      }

      // If we got here, we have a stream.
      // 1. Setup Audio Recorder (if tracks exist)
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
          setHasAudio(true); 
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
        // Wait for data before predicting
        videoRef.current.addEventListener('loadeddata', predictWebcam);
      }
      
      setIsCameraActive(true);

    } catch (err: any) {
      console.error("All Camera Strategies Failed:", err);
      
      if (!isAutoStart) {
          let msg = "Could not access camera after multiple attempts.";
          let title = "Access Denied";
          
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
              msg = "Permission was denied. Click the lock icon in your browser URL bar to Allow Camera.";
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
              title = "No Device Found";
              msg = "No camera hardware detected on this device.";
          } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
              title = "Hardware Error";
              msg = "Camera is likely in use by another app (Zoom, Teams, etc). Please close other apps.";
          } else if (err.name === 'OverconstrainedError') {
              title = "Constraint Error";
              msg = "Your camera does not support the requested resolution.";
          }

          setError({ 
              title, 
              msg, 
              details: `${err.name}: ${err.message}` 
          });
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
    <div className="relative w-full max-w-md aspect-video bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 group mx-auto">
      {!isLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-400 bg-zinc-900/50 backdrop-blur-sm z-20">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <span className="ml-3 font-mono text-sm">INITIALIZING AI...</span>
        </div>
      )}
      
      {/* PROFESSIONAL ERROR OVERLAY */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-zinc-950/95 backdrop-blur-md p-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col items-center text-center max-w-[90%] w-full">
             <div className="p-3 bg-red-500/10 rounded-full mb-3 shrink-0">
                <ShieldAlert className="w-8 h-8 text-red-500" />
             </div>
             <h3 className="text-white font-bold text-sm uppercase tracking-wide mb-2 break-words">{error.title}</h3>
             <p className="text-zinc-400 text-xs leading-relaxed mb-4 break-words text-balance">{error.msg}</p>
             
             {/* Technical Details for Debugging */}
             {error.details && (
                <div className="mb-4 p-2 bg-black/50 rounded border border-zinc-800 w-full">
                    <p className="text-[10px] font-mono text-red-400 break-all">{error.details}</p>
                </div>
             )}

             <button 
                onClick={() => startCamera(false)}
                className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-black px-4 py-2 rounded-lg transition-all font-bold text-xs uppercase tracking-wider shrink-0"
            >
                <RefreshCw size={14} />
                Try Again
            </button>
          </div>
        </div>
      )}
      
      {/* Start Button Overlay (Only if not active and loaded and NO error) */}
      {isLoaded && !isCameraActive && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 z-10 backdrop-blur-sm p-4">
             <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 text-center max-w-xs w-full shadow-xl">
                <div className="mx-auto bg-blue-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                     <Camera className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="text-white font-bold text-base mb-2">Enable Camera</h3>
                <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
                    Access is required to detect gestures and record meeting audio.
                </p>
                <button 
                    onClick={() => startCamera(false)}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    Start Monitor
                </button>
             </div>
        </div>
      )}
      
      <video
        ref={videoRef}
        autoPlay
        playsInline // CRITICAL for mobile
        muted // Muted locally
        className="w-full h-full object-cover transform -scale-x-100" 
      />
      
      {/* Live Indicator */}
      {isCameraActive && (
        <div className="absolute bottom-3 left-3 flex gap-2 z-10">
            <div className="bg-black/60 backdrop-blur px-2 py-1 rounded-md flex items-center gap-2 text-[10px] font-mono text-green-400 border border-green-500/30">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                LIVE
            </div>
            
            <div className={`bg-black/60 backdrop-blur px-2 py-1 rounded-md flex items-center gap-2 text-[10px] font-mono border ${hasAudio ? 'text-blue-400 border-blue-500/30' : 'text-zinc-500 border-zinc-700'}`}>
                {hasAudio ? <Mic size={10} /> : <MicOff size={10} />}
            </div>
        </div>
      )}

       {/* Room Code Indicator */}
       {roomCode && isCameraActive && (
        <div className="absolute bottom-3 right-3 bg-white/90 text-black px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-bottom-4 z-10">
            <div className="flex flex-col leading-none text-right">
                <span className="text-[8px] uppercase font-bold text-zinc-500 tracking-wider">CODE</span>
                <span className="text-sm font-black font-mono tracking-widest">{roomCode}</span>
            </div>
        </div>
       )}

      {/* Settings Toggle */}
      <button 
        onClick={() => setShowDebug(!showDebug)}
        className="absolute top-3 right-3 bg-black/40 hover:bg-black/70 p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors z-20"
      >
        <Settings2 size={14} />
      </button>

      {/* Debug & Fine Tuning Panel */}
      {showDebug && (
        <div className="absolute top-12 right-3 bg-black/90 backdrop-blur border border-zinc-800 p-3 rounded-lg text-[10px] font-mono w-40 shadow-xl z-20">
            <div className="flex items-center gap-2 text-zinc-400 mb-2 border-b border-zinc-800 pb-1">
                <Activity size={10} />
                <span>SENSITIVITY</span>
            </div>

            <div className="mb-3">
                <div className="flex justify-between text-zinc-500 mb-1">
                    <span>Low</span>
                    <span className="text-white">{sensitivity.toFixed(1)}</span>
                    <span>High</span>
                </div>
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

            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-zinc-500">
                <span>Amp Y:</span>
                <span className={debugStats.ampY > (0.08 - sensitivity * 0.06) ? 'text-green-400' : ''}>{debugStats.ampY.toFixed(2)}</span>
                <span>Osc Y:</span>
                <span className={debugStats.oscY >= 1 ? 'text-green-400' : ''}>{debugStats.oscY}</span>
                <span>Amp X:</span>
                <span className={debugStats.ampX > (0.08 - sensitivity * 0.06) ? 'text-red-400' : ''}>{debugStats.ampX.toFixed(2)}</span>
                <span>Osc X:</span>
                <span className={debugStats.oscX >= 1 ? 'text-red-400' : ''}>{debugStats.oscX}</span>
            </div>
        </div>
      )}

      {/* Professional Feedback Overlay */}
      {feedback && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className={`
                flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl border shadow-2xl transition-all transform animate-in fade-in slide-in-from-top-4
                ${feedback.type === 'NOD' 
                    ? 'bg-green-500/10 border-green-500/40 text-green-400 shadow-green-900/20' 
                    : 'bg-red-500/10 border-red-500/40 text-red-400 shadow-red-900/20'}
            `}>
                {feedback.type === 'NOD' ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase">{feedback.msg}</span>
            </div>
        </div>
      )}
    </div>
  );
});

export default FaceDetector;