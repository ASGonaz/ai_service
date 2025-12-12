// queues/queueManager.js
// Central queue management for all AI services
import Bull from "bull";
import { QUEUE_CONFIG, SERVICE_CONFIG } from "../config/aiModels.js";

// Queue instances
let audioQueue = null;
let imageQueue = null;
let ocrQueue = null;
let llmQueue = null;

/**
 * Initialize all queues
 */
export function initializeQueues() {
  console.log("🔄 Initializing Bull queues...");
  
  const { redis, defaultJobOptions } = QUEUE_CONFIG;
  
  // Audio transcription queue
  audioQueue = new Bull(SERVICE_CONFIG.audioTranscription.queueName, {
    redis,
    defaultJobOptions
  });
  
  // Image description queue
  imageQueue = new Bull(SERVICE_CONFIG.imageDescription.queueName, {
    redis,
    defaultJobOptions
  });
  
  // OCR (text extraction) queue
  ocrQueue = new Bull(SERVICE_CONFIG.imageOCR.queueName, {
    redis,
    defaultJobOptions
  });
  
  // Text generation (LLM) queue
  llmQueue = new Bull(SERVICE_CONFIG.textGeneration.queueName, {
    redis,
    defaultJobOptions
  });
  
  console.log("✅ All queues initialized");
  
  // Setup event listeners for monitoring
  setupQueueMonitoring(audioQueue, "Audio Transcription");
  setupQueueMonitoring(imageQueue, "Image Description");
  setupQueueMonitoring(ocrQueue, "OCR");
  setupQueueMonitoring(llmQueue, "Text Generation");
  
  return {
    audioQueue,
    imageQueue,
    ocrQueue,
    llmQueue
  };
}

/**
 * Setup monitoring for a queue
 */
function setupQueueMonitoring(queue, queueName) {
  queue.on("error", (error) => {
    console.error(`❌ [${queueName}] Queue error:`, error);
  });
  
  queue.on("failed", (job, err) => {
    console.error(`❌ [${queueName}] Job ${job.id} failed:`, err.message);
  });
  
  queue.on("stalled", (job) => {
    console.warn(`⚠️ [${queueName}] Job ${job.id} stalled`);
  });
  
  // Uncomment for verbose logging
  // queue.on("completed", (job) => {
  //   console.log(`✅ [${queueName}] Job ${job.id} completed`);
  // });
}

/**
 * Add audio transcription job to queue
 */
export async function enqueueAudioTranscription(audioUrl, options = {}) {
  if (!audioQueue) throw new Error("Audio queue not initialized");
  
  const job = await audioQueue.add({
    audioUrl,
    language: options.language || "ar",
    priority: options.priority || "normal",
    ...options
  }, {
    priority: options.priority === "high" ? 1 : options.priority === "low" ? 3 : 2,
    timeout: SERVICE_CONFIG.audioTranscription.timeout
  });
  
  return job;
}

/**
 * Add image description job to queue
 */
export async function enqueueImageDescription(imageUrl, prompt, options = {}) {
  if (!imageQueue) throw new Error("Image queue not initialized");
  
  const job = await imageQueue.add({
    imageUrl,
    prompt: prompt || "صف الصورة بشكل دقيق وبالعربية.",
    priority: options.priority || "normal",
    ...options
  }, {
    priority: options.priority === "high" ? 1 : options.priority === "low" ? 3 : 2,
    timeout: SERVICE_CONFIG.imageDescription.timeout
  });
  
  return job;
}

/**
 * Add OCR (text extraction) job to queue - ✨ NEW
 */
export async function enqueueOCR(imageUrl, languages = ["ar", "en"], options = {}) {
  if (!ocrQueue) throw new Error("OCR queue not initialized");
  
  const job = await ocrQueue.add({
    imageUrl,
    languages,
    priority: options.priority || "normal",
    ...options
  }, {
    priority: options.priority === "high" ? 1 : options.priority === "low" ? 3 : 2,
    timeout: SERVICE_CONFIG.imageOCR.timeout
  });
  
  return job;
}

/**
 * Add text generation (RAG) job to queue
 */
export async function enqueueTextGeneration(prompt, systemPrompt = "", options = {}) {
  if (!llmQueue) throw new Error("LLM queue not initialized");
  
  const job = await llmQueue.add({
    prompt,
    systemPrompt,
    maxTokens: options.maxTokens || 500,
    temperature: options.temperature || 0.7,
    priority: options.priority || "normal",
    ...options
  }, {
    priority: options.priority === "high" ? 1 : options.priority === "low" ? 3 : 2,
    timeout: SERVICE_CONFIG.textGeneration.timeout
  });
  
  return job;
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const stats = {};
  
  if (audioQueue) {
    stats.audio = await getQueueCounts(audioQueue);
  }
  
  if (imageQueue) {
    stats.image = await getQueueCounts(imageQueue);
  }
  
  if (ocrQueue) {
    stats.ocr = await getQueueCounts(ocrQueue);
  }
  
  if (llmQueue) {
    stats.llm = await getQueueCounts(llmQueue);
  }
  
  return stats;
}

/**
 * Get counts for a specific queue
 */
async function getQueueCounts(queue) {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);
  
  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed
  };
}

/**
 * Clean old jobs from all queues
 */
export async function cleanQueues(grace = 3600000) {
  console.log("🧹 Cleaning old jobs from queues...");
  
  const queues = [audioQueue, imageQueue, ocrQueue, llmQueue];
  const names = ["Audio", "Image", "OCR", "LLM"];
  
  for (let i = 0; i < queues.length; i++) {
    if (queues[i]) {
      try {
        await queues[i].clean(grace, "completed");
        await queues[i].clean(grace * 2, "failed");
        console.log(`✅ Cleaned ${names[i]} queue`);
      } catch (error) {
        console.error(`❌ Failed to clean ${names[i]} queue:`, error.message);
      }
    }
  }
}

/**
 * Close all queues gracefully
 */
export async function closeQueues() {
  console.log("🔄 Closing all queues...");
  
  const queues = [audioQueue, imageQueue, ocrQueue, llmQueue];
  
  await Promise.all(
    queues.filter(q => q).map(q => q.close())
  );
  
  console.log("✅ All queues closed");
}

export {
  audioQueue,
  imageQueue,
  ocrQueue,
  llmQueue
};
