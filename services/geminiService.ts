import { GoogleGenAI } from "@google/genai";
import { MeetingStats } from "../types";

// NOTE: In a real deployment, ensure process.env.API_KEY is available.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateMeetingSummary = async (stats: MeetingStats): Promise<string> => {
  const durationMinutes = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
  
  const prompt = `
    Analyze the following meeting consensus data:
    - Session Duration: ${durationMinutes} minutes
    - Total Head Nods (Agreement): ${stats.nods}
    - Total Head Shakes (Disagreement): ${stats.shakes}

    Provide a short, witty, and professional summary of the meeting's "vibe". 
    Did people agree? Was it contentious? 
    Keep it under 50 words.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating analysis. Please check API Key.";
  }
};