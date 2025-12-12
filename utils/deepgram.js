// utils/deepgram.js
// Deepgram API integration for audio transcription
import { createClient } from "@deepgram/sdk";

let deepgramClient = null;

/**
 * Initialize Deepgram client
 */
export function initializeDeepgram(apiKey) {
  if (!apiKey) {
    console.warn("⚠️ DEEPGRAM_API_KEY not set");
    return null;
  }
  
  deepgramClient = createClient(apiKey);
  console.log("✅ Deepgram client initialized");
  return deepgramClient;
}

/**
 * Transcribe audio using Deepgram Prerecorded API
 * Uses Whisper Large model with Arabic language support
 * 
 * @param {string} audioUrl - URL of the audio file
 * @param {string} language - Language code (default: "ar" for Arabic)
 * @returns {Promise<Object>} - Transcription result
 */
export async function transcribeAudioDeepgram(audioUrl, language = "ar") {
  if (!deepgramClient) {
    throw new Error("Deepgram client not initialized");
  }
  
  console.log(`🎤 Transcribing with Deepgram (language: ${language})...`);
  
  try {
    // Fetch audio file as blob (same approach as Groq)
    const resp = await fetch(audioUrl, { redirect: "follow" });
    if (!resp.ok) throw new Error(`fetch failed with ${resp.status}`);
    
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Use prerecorded transcription API with buffer
    const { result, error } = await deepgramClient.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: "whisper-large", // Whisper Large model (OpenAI Whisper on Deepgram)
        language: language, // Arabic by default
        smart_format: true, // Auto-formatting
        punctuate: true, // Add punctuation
        diarize: false, // No speaker diarization to reduce cost
        utterances: false, // No utterance segmentation
        detect_language: false // Don't auto-detect to reduce cost
      }
    );

    if (error) {
      throw new Error(`Deepgram API error: ${error.message || error}`);
    }

    // Extract transcription text
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    
    if (!transcript) {
      throw new Error("No transcript returned from Deepgram");
    }

    const confidence = result?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;
    const duration = result?.metadata?.duration || 0;

    console.log(`✅ Deepgram transcription completed (${duration.toFixed(2)}s, confidence: ${(confidence * 100).toFixed(1)}%)`);

    return {
      text: transcript,
      language: language,
      confidence: confidence,
      duration: duration,
      provider: "deepgram",
      model: "whisper-large",
      metadata: {
        channels: result?.results?.channels?.length || 1,
        model_info: result?.metadata?.model_info || {}
      }
    };
  } catch (error) {
    console.error("❌ Deepgram transcription error:", error.message);
    throw error;
  }
}

/**
 * Get Deepgram client instance
 */
export function getDeepgramClient() {
  return deepgramClient;
}

export default {
  initializeDeepgram,
  transcribeAudioDeepgram,
  getDeepgramClient
};
