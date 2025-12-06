# MeetingMate

**MeetingMate** is a real-time, multimodal meeting assistant designed to bridge the gap between non-verbal communication and accessibility. It uses computer vision to detect silent consensus (nods and head shakes) and transmits these signals to a mobile client for haptic feedback. Additionally, it leverages Generative AI to provide comprehensive, result-oriented meeting reports based on both visual engagement and audio context.
Live MeetingMate Beta URL: **https://meeting-mate-62yfu3jyc-mmms-projects-1a096f5b.vercel.app/**

## 🚀 Features

*   **Silent Consensus Tracking (Host Mode):**
    *   Uses **MediaPipe** to detect facial landmarks and head gestures (Nods for agreement, Shakes for disagreement) in real-time via the webcam.
    *   Filters out noise and accidental movements using a custom oscillation algorithm.
*   **Haptic Feedback Bridge (Client Mode):**
    *   Connects a mobile device to the host via a simple Room Code.
    *   Vibrates the phone when gestures are detected, allowing visually impaired users to "feel" the room's consensus.
*   **Multimodal AI Analysis:**
    *   Records meeting audio and synchronizes it with visual gesture statistics.
    *   Uses **Google Gemini 1.5** to generate an insight report, analyzing expression quality, summarizing outcomes, and extracting key quotes.

## 🛠️ Tech Stack

This project is built with a modern, performance-focused stack:

*   **Frontend Framework:** React 18 with TypeScript.
*   **Build Tool:** Vite.
*   **Computer Vision:** `@mediapipe/tasks-vision` (Running WASM for high-performance edge detection).
*   **Generative AI:** `@google/genai` (Google Gemini SDK).
*   **Real-Time Communication:** `peerjs` (WebRTC wrapper for low-latency, serverless P2P connection).
*   **Styling:** Tailwind CSS.
*   **Icons:** Lucide React.

## 📦 Installation & Setup

### Prerequisites
*   Node.js (v18 or higher recommended)
*   A Google Gemini API Key (for AI analysis features)

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/meeting-mate.git
cd meeting-mate
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
You need a Google Gemini API key to use the analysis features.
*   **For Local Development:** You can add it to a `.env` file (e.g., `VITE_API_KEY=...`) and update `vite.config.ts`, or set it in your deployment platform.
*   **For Vercel Deployment:** Add `API_KEY` in the Project Settings > Environment Variables.

### 4. Run Locally
```bash
# Export your API key in the terminal session (Linux/Mac)
export API_KEY="your_google_gemini_key"

# Windows PowerShell
$env:API_KEY="your_google_gemini_key"

# Start the dev server
npm run dev
```

The application will typically start at `http://localhost:5173`.

## 📱 How to Use

1.  **Host (Laptop/Desktop):**
    *   Open the app and select **Host Mode**.
    *   Grant camera permissions.
    *   Share the **Room Code** displayed on the screen.
    *   The app will automatically track gestures. Click "Stop & Generate Report" to analyze the session.

2.  **Participant (Mobile):**
    *   Open the app on a mobile browser and select **Participant Mode**.
    *   Enter the Host's **Room Code**.
    *   Keep the screen active to receive haptic feedback when the Host nods or shakes their head.
