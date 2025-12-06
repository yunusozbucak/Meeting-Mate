
import { GoogleGenAI, Type } from "@google/genai";
import { MeetingStats, AnalysisResult } from "../types";

// NOTE: In a real deployment, ensure process.env.API_KEY is available.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateMeetingSummary = async (stats: MeetingStats, audioBase64?: string): Promise<AnalysisResult> => {
  if (!process.env.API_KEY) {
    console.error("API Key is missing!");
    return {
        summary: "API Key Missing.",
        expressionQuality: "Cannot analyze.",
        insight: "Please configure your Google Gemini API Key in Vercel.",
        keyQuotes: []
    };
  }

  const durationMinutes = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
  const totalGestures = stats.nods + stats.shakes;
  const engagementLevel = totalGestures > 10 ? "High" : "Low";
  
  // Base prompt for behavioral context
  const textPrompt = `
    You are an expert executive meeting analyst. You have two data sources:
    1. VISUAL METRICS:
       - Duration: ${durationMinutes} minutes
       - Agreements (Nods): ${stats.nods}
       - Disagreements (Shakes): ${stats.shakes}
       - Physical Engagement: ${engagementLevel}
    
    2. AUDIO TRANSCRIPT (Attached Audio File):
       - Listen to the attached meeting audio carefully.

    **YOUR TASK:**
    Correlate the visual gestures with the spoken content to generate a Result-Oriented Insight Report.
    
    **OUTPUT REQUIREMENTS (JSON):**
    1. **summary**: A concrete summary of decisions made. Don't be vague. Mention specific topics discussed.
    2. **expressionQuality**: Analyze if participants spoke clearly. Did the audio tone match the visual gestures? (e.g., "Speaker sounded confident but visual disagreement was high").
    3. **keyQuotes**: Extract 3-4 critical verbatim sentences or phrases from the audio that drove the meeting's outcome.
    4. **insight**: A strategic observation connecting what was SAID to how people REACTED. (e.g., "When the budget cut was mentioned, disagreement gestures peaked, suggesting this topic needs a follow-up.")
  `;

  const parts: any[] = [{ text: textPrompt }];

  // If audio exists, attach it to the payload
  if (audioBase64) {
      parts.push({
          inlineData: {
              mimeType: "audio/webm",
              data: audioBase64
          }
      });
  } else {
      parts.push({ text: "[WARNING: No Audio Recorded. Base analysis on metrics only.]" });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
          role: 'user',
          parts: parts
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            expressionQuality: { type: Type.STRING },
            insight: { type: Type.STRING },
            keyQuotes: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
          },
          required: ["summary", "expressionQuality", "insight", "keyQuotes"],
        },
      }
    });

    const text = response.text || "{}";
    return JSON.parse(text) as AnalysisResult;

  } catch (error) {
    console.error("Gemini Error:", error);
    return {
        summary: "Analysis Failed",
        expressionQuality: "Could not determine expression levels due to connection error.",
        insight: "Please try again later.",
        keyQuotes: ["Analysis error occurred."]
    };
  }
};
