import { GoogleGenAI } from '@google/genai';

// Initialize the API using the API key from environment variables
// Centralized for security and simple maintenance.
const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';

if (!apiKey) {
    console.warn("⚠️ Gemini API Key is missing. AI features will not work.");
}

export const ai = new GoogleGenAI({ apiKey: apiKey as string });
