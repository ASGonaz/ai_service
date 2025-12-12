// utils/assemblyAi.js
// AssemblyAI integration for audio transcription
import { AssemblyAI } from "assemblyai";

let assemblyAIClient = null;

/**
 * Initialize AssemblyAI client
 */
export function initializeAssemblyAI(apiKey) {
  if (!apiKey) {
    console.warn("⚠️ ASSEMBLYAI_API_KEY not set");
    return null;
  }
  
  assemblyAIClient = new AssemblyAI({
    apiKey: apiKey
  });
  
  console.log("✅ AssemblyAI client initialized");
  return assemblyAIClient;
}

/**
 * Transcribe audio using AssemblyAI
 * Uses best model with Arabic language support
 * Prerecorded audio (not realtime)
 * 
 * @param {string} audioUrl - URL of the audio file
 * @param {string} language - Language code (default: "ar" for Arabic)
 * @returns {Promise<Object>} - Transcription result
 */
export async function transcribeAudioAssemblyAI(audioUrl, language = "ar") {
  if (!assemblyAIClient) {
    throw new Error("AssemblyAI client not initialized");
  }
  
  console.log(`🎤 Transcribing with AssemblyAI (language: ${language})...`);
  
  try {
    // Map language codes
    const languageCode = mapLanguageCode(language);
    
    // Fetch audio file as blob (same approach as Groq)
    console.log(`📥 Fetching audio file from URL...`);
    const resp = await fetch(audioUrl, { redirect: "follow" });
    if (!resp.ok) throw new Error(`fetch failed with ${resp.status}`);
    
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Upload the audio file to AssemblyAI
    console.log(`📤 Uploading audio to AssemblyAI...`);
    const uploadUrl = await assemblyAIClient.files.upload(buffer);
    
    // Transcribe the uploaded file
    const params = {
      audio_url: uploadUrl,
      language_code: languageCode,
      // Use cheapest options - no extra features
      speaker_labels: false, // No diarization
      punctuate: true, // Basic punctuation
      format_text: true, // Basic formatting
      // Disable expensive features
      auto_highlights: false,
      content_safety: false,
      iab_categories: false,
      sentiment_analysis: false,
      entity_detection: false,
      summarization: false,
      auto_chapters: false
    };

    const transcript = await assemblyAIClient.transcripts.transcribe(params);

    if (transcript.status === "error") {
      throw new Error(`AssemblyAI transcription error: ${transcript.error}`);
    }

    if (!transcript.text) {
      throw new Error("No transcript text returned from AssemblyAI");
    }

    const confidence = transcript.confidence || 0;
    const duration = transcript.audio_duration || 0;

    console.log(`✅ AssemblyAI transcription completed (${duration.toFixed(2)}s, confidence: ${(confidence * 100).toFixed(1)}%)`);

    return {
      text: transcript.text,
      language: languageCode,
      confidence: confidence,
      duration: duration,
      provider: "assemblyai",
      model: "best",
      metadata: {
        id: transcript.id,
        words_count: transcript.words?.length || 0,
        language_detection: transcript.language_detection || null
      }
    };
  } catch (error) {
    console.error("❌ AssemblyAI transcription error:", error.message);
    throw error;
  }
}

/**
 * Map language codes to AssemblyAI format
 */
function mapLanguageCode(lang) {
  const mapping = {
    'ar': 'ar', // Arabic
    'en': 'en', // English
    'en-US': 'en_us',
    'en-GB': 'en_uk',
    'en-AU': 'en_au',
    // Add more mappings as needed
  };
  
  return mapping[lang] || lang;
}

/**
 * Get AssemblyAI client instance
 */
export function getAssemblyAIClient() {
  return assemblyAIClient;
}

/**
 * Check transcription status (for polling if needed)
 */
export async function checkTranscriptionStatus(transcriptId) {
  if (!assemblyAIClient) {
    throw new Error("AssemblyAI client not initialized");
  }
  
  const transcript = await assemblyAIClient.transcripts.get(transcriptId);
  return {
    status: transcript.status,
    text: transcript.text,
    error: transcript.error
  };
}

export default {
  initializeAssemblyAI,
  transcribeAudioAssemblyAI,
  getAssemblyAIClient,
  checkTranscriptionStatus
};
