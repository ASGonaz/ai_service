// workers/imageWorker.js
// Worker for processing image description jobs
import { initializeProviders, describeImageGroq, describeImageGemini } from "../utils/aiProvidersDirect.js";
import { checkRateLimit, incrementRateLimit } from "../utils/rateLimiter.js";
import { QUEUE_CONFIG } from "../config/aiModels.js";
import dotenv from "dotenv";

dotenv.config();

// Initialize AI providers
initializeProviders(process.env.GROQ_API_KEY, process.env.GEMINI_API_KEY);

/**
 * Process image description job
 */
export async function processImageJob(job) {
  const { imageUrl, prompt = "صف الصورة بشكل دقيق وبالعربية." } = job.data;
  
  console.log(`🖼️ [Image Worker] Processing job ${job.id}: ${imageUrl}`);
  
  // Try Groq first
  try {
    const groqLimit = await checkRateLimit("groq", "imageDescription");
    
    if (groqLimit.allowed) {
      const result = await describeImageGroq(imageUrl, prompt);
      await incrementRateLimit("groq", "imageDescription");
      console.log(`✅ [Image Worker] Job ${job.id} completed with Groq`);
      return result;
    } else {
      console.warn(`⚠️ [Image Worker] Groq rate limit reached, retry in ${groqLimit.retryAfter}s`);
    }
  } catch (groqError) {
    console.warn(`⚠️ [Image Worker] Groq failed for job ${job.id}:`, groqError.message);
  }
  
  // Fallback to Gemini
  try {
    const geminiLimit = await checkRateLimit("gemini", "imageDescription");
    
    if (!geminiLimit.allowed) {
      throw new Error(`Rate limit exceeded for both providers. Retry after ${geminiLimit.retryAfter}s`);
    }
    
    const result = await describeImageGemini(imageUrl, prompt);
    await incrementRateLimit("gemini", "imageDescription");
    console.log(`✅ [Image Worker] Job ${job.id} completed with Gemini (fallback)`);
    return result;
  } catch (geminiError) {
    console.error(`❌ [Image Worker] Both providers failed for job ${job.id}`);
    throw new Error(`Image description failed: ${geminiError.message}`);
  }
}

/**
 * Setup image worker
 */
export function setupImageWorker(queue) {
  const concurrency = QUEUE_CONFIG.workerConcurrency.imageDescription;
  
  queue.process(concurrency, async (job) => {
    return await processImageJob(job);
  });
  
  console.log(`✅ Image worker started (concurrency: ${concurrency})`);
  
  return queue;
}
