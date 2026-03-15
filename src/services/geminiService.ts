import { GoogleGenAI } from "@google/genai";
import { LogStats, AIInsight } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateInsights(stats: LogStats): Promise<AIInsight[]> {
  if (!process.env.GEMINI_API_KEY) {
    return [
      {
        title: "AI Insights Unavailable",
        description: "Please configure your Gemini API key to see automated insights.",
        type: "info"
      }
    ];
  }

  const prompt = `
    Analyze the following log statistics and provide 3-4 actionable insights.
    Format the response as a JSON array of objects with "title", "description", and "type" (one of 'warning', 'info', 'success').
    
    Statistics:
    - Total Logs: ${stats.totalLogs}
    - Log Levels: ${JSON.stringify(stats.levelCounts)}
    - Top IPs: ${JSON.stringify(stats.topIPs)}
    - Frequent Errors: ${JSON.stringify(stats.errorFrequency)}
    - Average Request Duration: ${stats.averageDuration || 'N/A'}
    
    Focus on:
    1. Peak error times or high error rates.
    2. Potential security issues (e.g., suspicious IP activity).
    3. Performance bottlenecks.
    4. General system health.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating insights:", error);
    return [
      {
        title: "Analysis Error",
        description: "Failed to generate AI insights. Please check the logs manually.",
        type: "warning"
      }
    ];
  }
}
