// workers/ocrWorker.js
// Worker for processing OCR (text extraction) jobs - ✨ NEW
import { initializeProviders, extractTextGroq, extractTextGemini } from "../utils/aiProvidersDirect.js";
import { checkRateLimit, incrementRateLimit } from "../utils/rateLimiter.js";
import { QUEUE_CONFIG } from "../config/aiModels.js";
import dotenv from "dotenv";

dotenv.config();

// Initialize AI providers
initializeProviders(process.env.GROQ_API_KEY, process.env.GEMINI_API_KEY);

/**
 * Process OCR job
 */
export async function processOCRJob(job) {
  const { imageUrl, languages = ["ar", "en"] } = job.data;
  
  console.log(`📝 [OCR Worker] Processing job ${job.id}: ${imageUrl}`);
  
  // Try Groq first
  try {
    const groqLimit = await checkRateLimit("groq", "imageOCR");
    
    if (groqLimit.allowed) {
      const result = await extractTextGroq(imageUrl, languages);
      await incrementRateLimit("groq", "imageOCR");
      console.log(`✅ [OCR Worker] Job ${job.id} completed with Groq`);
      return result;
    } else {
      console.warn(`⚠️ [OCR Worker] Groq rate limit reached, retry in ${groqLimit.retryAfter}s`);
    }
  } catch (groqError) {
    console.warn(`⚠️ [OCR Worker] Groq failed for job ${job.id}:`, groqError.message);
  }
  
  // Fallback to Gemini
  try {
    const geminiLimit = await checkRateLimit("gemini", "imageOCR");
    
    if (!geminiLimit.allowed) {
      throw new Error(`Rate limit exceeded for both providers. Retry after ${geminiLimit.retryAfter}s`);
    }
    
    const result = await extractTextGemini(imageUrl, languages);
    await incrementRateLimit("gemini", "imageOCR");
    console.log(`✅ [OCR Worker] Job ${job.id} completed with Gemini (fallback)`);
    return result;
  } catch (geminiError) {
    console.error(`❌ [OCR Worker] Both providers failed for job ${job.id}`);
    throw new Error(`OCR failed: ${geminiError.message}`);
  }
}

/**
 * Setup OCR worker
 */
export function setupOCRWorker(queue) {
  const concurrency = QUEUE_CONFIG.workerConcurrency.imageOCR;
  
  queue.process(concurrency, async (job) => {
    return await processOCRJob(job);
  });
  
  console.log(`✅ OCR worker started (concurrency: ${concurrency})`);
  
  return queue;
}
