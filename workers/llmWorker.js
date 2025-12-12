// workers/llmWorker.js
// Worker for processing text generation (LLM/RAG) jobs
import { initializeProviders, generateTextGroq, generateTextGemini } from "../utils/aiProvidersDirect.js";
import { checkRateLimit, incrementRateLimit } from "../utils/rateLimiter.js";
import { QUEUE_CONFIG } from "../config/aiModels.js";
import dotenv from "dotenv";

dotenv.config();

// Initialize AI providers
initializeProviders(process.env.GROQ_API_KEY, process.env.GEMINI_API_KEY);

/**
 * Process text generation job
 */
export async function processLLMJob(job) {
  const {
    prompt,
    systemPrompt = "",
    maxTokens = 500,
    temperature = 0.7
  } = job.data;

  console.log(`🤖 [LLM Worker] Processing job ${job.id}`);

  // Try Groq first
  try {
    const groqLimit = await checkRateLimit("groq", "textGeneration");

    if (groqLimit.allowed) {
      const result = await generateTextGroq(prompt, systemPrompt, { maxTokens, temperature });
      await incrementRateLimit("groq", "textGeneration");
      console.log(`✅ [LLM Worker] Job ${job.id} completed with Groq`);
      return result;
    } else {
      console.warn(`⚠️ [LLM Worker] Groq rate limit reached, retry in ${groqLimit.retryAfter}s`);
    }
  } catch (groqError) {
    console.warn(`⚠️ [LLM Worker] Groq failed for job ${job.id}:`, groqError.message);
  }

  // Fallback to Gemini
  try {
    const geminiLimit = await checkRateLimit("gemini", "textGeneration");

    if (!geminiLimit.allowed) {
      throw new Error(`Rate limit exceeded for both providers. Retry after ${geminiLimit.retryAfter}s`);
    }

    const result = await generateTextGemini(prompt, systemPrompt, { maxTokens, temperature });
    await incrementRateLimit("gemini", "textGeneration");
    console.log(`✅ [LLM Worker] Job ${job.id} completed with Gemini (fallback)`);
    return result;
  } catch (geminiError) {
    console.error(`❌ [LLM Worker] Both providers failed for job ${job.id}`);
    throw new Error(`Text generation failed: ${geminiError.message}`);
  }
}

/**
 * Setup LLM worker
 */
export function setupLLMWorker(queue) {
  const concurrency = QUEUE_CONFIG.workerConcurrency.textGeneration;

  queue.process(concurrency, async (job) => {
    return await processLLMJob(job);
  });

  console.log(`✅ LLM worker started (concurrency: ${concurrency})`);

  return queue;
}
