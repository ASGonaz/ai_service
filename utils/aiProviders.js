// utils/aiProviders.js
// Queue-based AI provider interface (enqueues jobs, returns results)
import { 
  enqueueAudioTranscription, 
  enqueueImageDescription, 
  enqueueOCR, 
  enqueueTextGeneration 
} from "../queues/queueManager.js";

/**
 * Initialize AI providers (compatibility function)
 */
export function initializeProviders(groqApiKey, geminiApiKey, deepgramApiKey, assemblyAIApiKey) {
  // This function is kept for compatibility but providers are initialized in workers
  if (!groqApiKey && !geminiApiKey && !deepgramApiKey && !assemblyAIApiKey) {
    console.warn("⚠️ No AI provider API keys set");
  }
}


/**
 * Transcribe audio using queue system
 * @param {string} audioUrl - URL to audio file
 * @param {Object} options - Options (language, priority, etc.)
 * @returns {Promise<{text: string, language: string|null, provider: string}>}
 */
export async function transcribeAudio(audioUrl, options = {}) {
  console.log("🎤 Enqueuing audio transcription...");
  
  const job = await enqueueAudioTranscription(audioUrl, options);
  
  // Wait for job to complete
  const result = await job.finished();
  
  console.log("✅ Audio transcription completed");
  return result;
}


/**
 * Describe image using queue system
 * @param {string} imageUrl - URL to image
 * @param {string} prompt - Description prompt
 * @param {Object} options - Options (priority, etc.)
 * @returns {Promise<{description: string, provider: string}>}
 */
export async function describeImage(imageUrl, prompt = "صف الصورة بشكل دقيق وبالعربية.", options = {}) {
  console.log("🖼️ Enqueuing image description...");
  
  const job = await enqueueImageDescription(imageUrl, prompt, options);
  
  // Wait for job to complete
  const result = await job.finished();
  
  console.log("✅ Image description completed");
  return result;
}

/**
 * Extract text (OCR) from image using queue system - ✨ NEW
 * @param {string} imageUrl - URL to image
 * @param {Array<string>} languages - Languages to extract (default: ["ar", "en"])
 * @param {Object} options - Options (priority, etc.)
 * @returns {Promise<{text: string, hasText: boolean, languages: Array, provider: string}>}
 */
export async function extractText(imageUrl, languages = ["ar", "en"], options = {}) {
  console.log("📝 Enqueuing OCR...");
  
  const job = await enqueueOCR(imageUrl, languages, options);
  
  // Wait for job to complete
  const result = await job.finished();
  
  console.log("✅ OCR completed");
  return result;
}


/**
 * Generate RAG answer using queue system
 * @param {string} question - User question
 * @param {Array} contexts - Retrieved context documents
 * @param {Object} options - Generation options
 * @returns {Promise<{answer: string, provider: string}>}
 */
export async function generateRAGAnswer(question, contexts, options = {}) {
  const { maxTokens = 500, temperature = 0.7 } = options;

  const contextText = contexts
    .map((ctx, idx) => `${idx + 1}. ${ctx.text}`)
    .join('\n');
console.log("model contextText:", contextText);
  const prompt = `أجب على السؤال بناءً على المعلومات التالية فقط:

${contextText}

السؤال: ${question}
الجواب:`;

  const systemPrompt = "أنت مساعد ذكي. أجب بناءً على المعلومات المعطاة فقط. كن دقيقاً ومختصراً.";

  console.log("🤖 Enqueuing RAG generation...");
  
  const job = await enqueueTextGeneration(prompt, systemPrompt, {
    maxTokens,
    temperature,
    ...options
  });
  
  // Wait for job to complete
  const result = await job.finished();
  
  console.log("✅ RAG answer generated");
  return result;
}

/**
 * Generate text using queue system (direct export for server.js)
 */
export { enqueueTextGeneration };

export { enqueueAudioTranscription, enqueueImageDescription, enqueueOCR };
