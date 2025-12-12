// workers/audioWorker.js
// Worker for processing audio transcription jobs
import { 
  initializeProviders, 
  transcribeAudioGroq, 
  transcribeAudioDeepgram,
  transcribeAudioAssemblyAI 
} from "../utils/aiProvidersDirect.js";
import { checkRateLimit, incrementRateLimit } from "../utils/rateLimiter.js";
import { QUEUE_CONFIG } from "../config/aiModels.js";
import dotenv from "dotenv";

dotenv.config();

// Initialize AI providers
initializeProviders(
  process.env.GROQ_API_KEY, 
  process.env.GEMINI_API_KEY,
  process.env.DEEPGRAM_API_KEY,
  process.env.ASSEMBLYAI_API_KEY
);

/**
 * Process audio transcription job
 */
export async function processAudioJob(job) {
  const { audioUrl, language = "ar" } = job.data;
  
  console.log(`🎤 [Audio Worker] Processing job ${job.id}: ${audioUrl}`);
  
  // Try Groq first (primary)
  try {
    const groqLimit = await checkRateLimit("groq", "audioTranscription");
    
    if (groqLimit.allowed) {
      const result = await transcribeAudioGroq(audioUrl, language);
      await incrementRateLimit("groq", "audioTranscription");
      console.log(`✅ [Audio Worker] Job ${job.id} completed with Groq`);
      return result;
    } else {
      console.warn(`⚠️ [Audio Worker] Groq rate limit reached, retry in ${groqLimit.retryAfter}s`);
    }
  } catch (groqError) {
    console.warn(`⚠️ [Audio Worker] Groq failed for job ${job.id}:`, groqError.message);
  }
  
  // Fallback #1: Deepgram
  try {
    
    const deepgramLimit = await checkRateLimit("deepgram", "audioTranscription");
    
    if (deepgramLimit.allowed) {
      const result = await transcribeAudioDeepgram(audioUrl, language);
      await incrementRateLimit("deepgram", "audioTranscription");
      console.log(`✅ [Audio Worker] Job ${job.id} completed with Deepgram (fallback #1)`);
      return result;
    } else {
      console.warn(`⚠️ [Audio Worker] Deepgram rate limit reached, retry in ${deepgramLimit.retryAfter}s`);
    }
  } catch (deepgramError) {
    console.warn(`⚠️ [Audio Worker] Deepgram failed for job ${job.id}:`, deepgramError.message);
  }
  
  // Fallback #2: AssemblyAI
  try {
    
    const assemblyAILimit = await checkRateLimit("assemblyai", "audioTranscription");
    
    if (!assemblyAILimit.allowed) {
      throw new Error(`Rate limit exceeded for all providers. Retry after ${assemblyAILimit.retryAfter}s`);
    }
    
    const result = await transcribeAudioAssemblyAI(audioUrl, language);
    await incrementRateLimit("assemblyai", "audioTranscription");
    console.log(`✅ [Audio Worker] Job ${job.id} completed with AssemblyAI (fallback #2)`);
    return result;
  } catch (assemblyAIError) {
    console.error(`❌ [Audio Worker] All providers failed for job ${job.id}`);
    throw new Error(`Audio transcription failed: ${assemblyAIError.message}`);
  }
}

/**
 * Setup audio worker
 */
export function setupAudioWorker(queue) {
  const concurrency = QUEUE_CONFIG.workerConcurrency.audioTranscription;
  
  queue.process(concurrency, async (job) => {
    return await processAudioJob(job);
  });
  
  console.log(`✅ Audio worker started (concurrency: ${concurrency})`);
  
  return queue;
}
