// worker.js
// Main worker process - starts all queue workers
import dotenv from "dotenv";
import { initializeQueues, closeQueues, cleanQueues } from "./queues/queueManager.js";
import { initializeRateLimiter, closeRateLimiter } from "./utils/rateLimiter.js";
import { QUEUE_CONFIG } from "./config/aiModels.js";
import { setupAudioWorker } from "./workers/audioWorker.js";
import { setupImageWorker } from "./workers/imageWorker.js";
import { setupOCRWorker } from "./workers/ocrWorker.js";
import { setupLLMWorker } from "./workers/llmWorker.js";

dotenv.config();

console.log("=" * 70);
console.log("🏭 Starting AI Queue Workers");
console.log("=".repeat(70));

// Validate environment
if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY && !process.env.DEEPGRAM_API_KEY && !process.env.ASSEMBLYAI_API_KEY) {
  console.error("❌ Error: No AI provider API keys configured!");
  console.error("   Set GROQ_API_KEY, GEMINI_API_KEY, DEEPGRAM_API_KEY, and/or ASSEMBLYAI_API_KEY in .env");
  process.exit(1);
}

// Initialize Redis for rate limiting
console.log("\n🔄 Initializing rate limiter...");
initializeRateLimiter(QUEUE_CONFIG.redis);

// Initialize all queues
console.log("🔄 Initializing queues...");
const { audioQueue, imageQueue, ocrQueue, llmQueue } = initializeQueues();

// Setup workers
console.log("\n🔄 Setting up workers...");
setupAudioWorker(audioQueue);
setupImageWorker(imageQueue);
setupOCRWorker(ocrQueue);
setupLLMWorker(llmQueue);

console.log("\n✅ All workers ready!");
console.log("=" * 70);
console.log("\n📊 Worker Configuration:");
console.log(`   Audio Transcription: ${QUEUE_CONFIG.workerConcurrency.audioTranscription} concurrent jobs`);
console.log(`   Image Description:   ${QUEUE_CONFIG.workerConcurrency.imageDescription} concurrent jobs`);
console.log(`   OCR:                 ${QUEUE_CONFIG.workerConcurrency.imageOCR} concurrent jobs`);
console.log(`   Text Generation:     ${QUEUE_CONFIG.workerConcurrency.textGeneration} concurrent jobs`);
console.log("\n💾 Redis: " + `${QUEUE_CONFIG.redis.host}:${QUEUE_CONFIG.redis.port}`);
console.log("\n🎯 Providers:");
console.log("   Primary: Groq" + (process.env.GROQ_API_KEY ? " ✅" : " ❌"));
console.log("   Vision/LLM: Gemini" + (process.env.GEMINI_API_KEY ? " ✅" : " ❌"));
console.log("   Audio Fallback #1: Deepgram" + (process.env.DEEPGRAM_API_KEY ? " ✅" : " ❌"));
console.log("   Audio Fallback #2: AssemblyAI" + (process.env.ASSEMBLYAI_API_KEY ? " ✅" : " ❌"));
console.log("\n");

// Clean old jobs periodically (every hour)
setInterval(async () => {
  try {
    await cleanQueues();
  } catch (error) {
    console.error("❌ Error cleaning queues:", error);
  }
}, 3600000); // 1 hour

// Graceful shutdown
async function shutdown() {
  console.log("\n🔄 Shutting down workers...");
  
  try {
    await closeQueues();
    await closeRateLimiter();
    console.log("✅ Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
  shutdown();
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled rejection at:", promise, "reason:", reason);
});
