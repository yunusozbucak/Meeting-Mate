
export enum AppMode {
  INTRO = 'INTRO',
  HOST = 'HOST',
  CLIENT = 'CLIENT'
}

export interface MeetingStats {
  nods: number;
  shakes: number;
  lastGestureTime: number;
  startTime: number;
}

export interface AnalysisResult {
  summary: string;
  expressionQuality: string;
  insight: string;
  keyQuotes: string[]; // New: Extracted key phrases from audio
}

export interface SignalMessage {
  type: 'GESTURE_DETECTED';
  gesture: 'NOD' | 'SHAKE';
  timestamp: number;
  senderId: string;
}

// MediaPipe basic types to avoid heavy type library dependency in this snippet
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface DetectionResult {
  faceLandmarks: Landmark[][];
}
