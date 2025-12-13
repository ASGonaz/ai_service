// config/aiModels.js
// Centralized configuration for all AI models and rate limits
import dotenv from "dotenv";

dotenv.config();
export const AI_MODELS = {
  // ==================== GROQ Models ====================
  groq: {
    audio: {
      whisperLargeV3Turbo: {
        name: "whisper-large-v3-turbo",
        service: "audio-transcription",
        // Groq free tier: 20 requests/minute for audio
        rateLimit: {
          requestsPerMinute: 20,
          requestsPerDay: 1000
        }
      },
      whisperLargeV3: {
        name: "whisper-large-v3",
        service: "audio-transcription",
        rateLimit: {
          requestsPerMinute: 20,
          requestsPerDay: 1000
        }
      }
    },
    vision: {
      llama4Scout: {
        name: "meta-llama/llama-4-scout-17b-16e-instruct",
        service: "image-description",
        // Groq free tier: 30 requests/minute for vision
        rateLimit: {
          requestsPerMinute: 30,
          requestsPerDay: 14400
        }
      }
    },
    llm: {
      llama33: {
        name: "llama-3.3-70b-versatile",
        service: "text-generation",
        // Groq free tier: 30 requests/minute, 14400/day
        rateLimit: {
          requestsPerMinute: 30,
          requestsPerDay: 14400
        }
      },
      llama32: {
        name: "llama-3.2-90b-text-preview",
        service: "text-generation",
        rateLimit: {
          requestsPerMinute: 30,
          requestsPerDay: 14400
        }
      }
    }
  },

  // ==================== DEEPGRAM Models ====================
  deepgram: {
    audio: {
      whisperLarge: {
        name: "whisper-large",
        service: "audio-transcription",
        // Deepgram: $200 credit (Whisper Large is $0.0048/min for prerecorded)
        // At 2min avg: ~$0.0096 per request
        // Approx capacity: 20,833 requests (~41,666 minutes = ~694 hours)
        // Conservative limit: 30 requests/min, 10000 requests/day
        rateLimit: {
          requestsPerMinute: 30,
          requestsPerDay: 10000,
          creditLimit: 200, // USD
          estimatedCostPerRequest: 0.0096 // Assuming 2min average audio
        }
      }
    }
  },

  // ==================== ASSEMBLYAI Models ====================
  assemblyai: { //node cash
    audio: {
      best: {
        name: "best",
        service: "audio-transcription",
        // AssemblyAI: $50 credit ($0.00025/sec for core transcription)
        // At 2min avg (120sec): ~$0.03 per request
        // Approx capacity: 1,667 requests (~200,000 seconds = ~3,333 minutes)
        // Conservative limit: 20 requests/min, 5000 requests/day
        rateLimit: {
          requestsPerMinute: 20,
          requestsPerDay: 5000,
          creditLimit: 50, // USD
          estimatedCostPerRequest: 0.03 // Assuming 2min average audio (120 seconds)
        }
      }
    }
  },

  // ==================== GEMINI Models ====================
  gemini: {
    vision: {
      flash: {
        name: "gemini-1.5-flash",
        service: "image-description",
        rateLimit: {
          requestsPerMinute: 15,
          requestsPerDay: 1500
        }
      },
      pro: {
        name: "gemini-1.5-pro",
        service: "image-description",
        rateLimit: {
          requestsPerMinute: 2,
          requestsPerDay: 50
        }
      }
    },
    llm: {
      flash: {
        name: "gemini-2.5-flash-lite",
        service: "text-generation",
        rateLimit: {
          requestsPerMinute: 15,
          requestsPerDay: 1000
        }
      },
      pro: {
        name: "gemini-1.5-pro",
        service: "text-generation",
        rateLimit: {
          requestsPerMinute: 2,
          requestsPerDay: 50
        }
      }
    }
  }
};

// ==================== Service Configuration ====================
export const SERVICE_CONFIG = {
  audioTranscription: {
    queueName: "audio-transcription-queue",
    primary: {
      provider: "groq",
      model: AI_MODELS.groq.audio.whisperLargeV3Turbo
    },
    fallbacks: [
      {
        provider: "deepgram",
        model: AI_MODELS.deepgram.audio.whisperLarge
      },
      {
        provider: "assemblyai",
        model: AI_MODELS.assemblyai.audio.best
      }
    ],
    defaultLanguage: "ar", // Arabic default
    timeout: 120000 // 2 minutes
  },

  imageDescription: {
    queueName: "image-description-queue",
    primary: {
      provider: "groq",
      model: AI_MODELS.groq.vision.llama4Scout
    },
    fallback: {
      provider: "gemini",
      model: AI_MODELS.gemini.vision.flash
    },
    timeout: 60000 // 1 minute
  },

  imageOCR: {
    queueName: "image-ocr-queue",
    primary: {
      provider: "groq",
      model: AI_MODELS.groq.vision.llama4Scout
    },
    fallback: {
      provider: "gemini",
      model: AI_MODELS.gemini.vision.flash
    },
    supportedLanguages: ["ar", "en"],
    timeout: 60000
  },

  textGeneration: {
    queueName: "text-generation-queue",
    primary: {
      provider: "groq",
      model: AI_MODELS.groq.llm.llama33
    },
    fallback: {
      provider: "gemini",
      model: AI_MODELS.gemini.llm.flash
    },
    timeout: 90000
  }
};

// ==================== Queue Configuration ====================
export const QUEUE_CONFIG = {
  redis:
  
   process.env.MESSAGES_REDIS_URL
  
 /* {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || "1"),
    maxRetriesPerRequest: 3
  }*/
  
  ,

  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 3600   // Keep for 1 hour
    },
    removeOnFail: {
      count: 500  // Keep last 500 failed jobs for debugging
    }
  },

  // Worker concurrency per service
  workerConcurrency: {
    audioTranscription: 3,
    imageDescription: 5,
    imageOCR: 5,
    textGeneration: 4
  }
};

// ==================== Rate Limit Keys ====================
export function getRateLimitKey(provider, service, timeWindow = "minute") {
  return `ratelimit:${provider}:${service}:${timeWindow}`;
}

// ==================== Helper Functions ====================
export function getModelConfig(provider, serviceType, modelKey = "primary") {
  const service = SERVICE_CONFIG[serviceType];
  if (!service) {
    throw new Error(`Unknown service type: ${serviceType}`);
  }

  if (modelKey === "primary" || modelKey === "fallback") {
    return service[modelKey];
  }

  throw new Error(`Invalid model key: ${modelKey}`);
}

export function getRateLimit(provider, service) {
  const config = getModelConfig(provider, service, "primary");
  return config.model.rateLimit;
}

export default {
  AI_MODELS,
  SERVICE_CONFIG,
  QUEUE_CONFIG,
  getRateLimitKey,
  getModelConfig,
  getRateLimit
};
