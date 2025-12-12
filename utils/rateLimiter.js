// utils/rateLimiter.js
// Redis-based rate limiter with dynamic limits per provider/service
import Redis from "ioredis";
import { getRateLimitKey, getRateLimit } from "../config/aiModels.js";

let redis = null;

/**
 * Initialize Redis client for rate limiting
 */
export function initializeRateLimiter(redisConfig) {
  redis = new Redis(redisConfig);
  
  redis.on("error", (err) => {
    console.error("❌ Redis rate limiter error:", err);
  });
  
  redis.on("connect", () => {
    console.log("✅ Rate limiter Redis connected");
  });
  
  return redis;
}

/**
 * Check if request is allowed based on rate limits
 * @param {string} provider - "groq", "gemini", "deepgram", or "assemblyai"
 * @param {string} service - "audioTranscription", "imageDescription", "imageOCR", or "textGeneration"
 * @returns {Promise<{allowed: boolean, retryAfter: number|null}>}
 */
export async function checkRateLimit(provider, service) {
  if (!redis) {
    console.warn("⚠️ Rate limiter not initialized, allowing request");
    return { allowed: true, retryAfter: null };
  }
  
  try {
    const limits = getRateLimit(provider, service);
    
    // Check minute limit
    const minuteKey = getRateLimitKey(provider, service, "minute");
    const minuteCount = await redis.get(minuteKey);
    
    if (minuteCount && parseInt(minuteCount) >= limits.requestsPerMinute) {
      const ttl = await redis.ttl(minuteKey);
      console.warn(`⚠️ Rate limit exceeded for ${provider}/${service} (per minute)`);
      return { allowed: false, retryAfter: ttl };
    }
    
    // Check daily limit
    const dayKey = getRateLimitKey(provider, service, "day");
    const dayCount = await redis.get(dayKey);
    
    if (dayCount && parseInt(dayCount) >= limits.requestsPerDay) {
      const ttl = await redis.ttl(dayKey);
      console.warn(`⚠️ Rate limit exceeded for ${provider}/${service} (per day)`);
      return { allowed: false, retryAfter: ttl };
    }
    
    // Check credit limit for paid services (Deepgram, AssemblyAI)
    if (limits.creditLimit) {
      const creditKey = `ratelimit:${provider}:${service}:credits`;
      const creditsUsed = await redis.get(creditKey);
      
      if (creditsUsed && parseFloat(creditsUsed) >= limits.creditLimit) {
        console.warn(`⚠️ Credit limit exceeded for ${provider}/${service} ($${creditsUsed}/$${limits.creditLimit})`);
        return { allowed: false, retryAfter: null }; // Credits don't reset automatically
      }
    }
    
    return { allowed: true, retryAfter: null };
  } catch (error) {
    console.error("❌ Rate limit check error:", error);
    // Fail open - allow request if rate limiter fails
    return { allowed: true, retryAfter: null };
  }
}

/**
 * Increment rate limit counters after successful request
 * @param {string} provider - "groq", "gemini", "deepgram", or "assemblyai"
 * @param {string} service - Service type
 */
export async function incrementRateLimit(provider, service) {
  if (!redis) return;
  
  try {
    const limits = getRateLimit(provider, service);
    const minuteKey = getRateLimitKey(provider, service, "minute");
    const dayKey = getRateLimitKey(provider, service, "day");
    
    // Increment minute counter (TTL: 60 seconds)
    const minuteCount = await redis.incr(minuteKey);
    if (minuteCount === 1) {
      await redis.expire(minuteKey, 60);
    }
    
    // Increment day counter (TTL: 24 hours)
    const dayCount = await redis.incr(dayKey);
    if (dayCount === 1) {
      await redis.expire(dayKey, 86400);
    }
    
    // Track credits for paid services (Deepgram, AssemblyAI)
    if (limits.creditLimit && limits.estimatedCostPerRequest) {
      const creditKey = `ratelimit:${provider}:${service}:credits`;
      const creditsUsed = await redis.incrbyfloat(creditKey, limits.estimatedCostPerRequest);
      
      // Set expiry to 30 days for credit tracking
      if (creditsUsed <= limits.estimatedCostPerRequest) {
        await redis.expire(creditKey, 2592000); // 30 days
      }
      
      console.log(`📊 Rate limit: ${provider}/${service} - Minute: ${minuteCount}, Day: ${dayCount}, Credits: $${creditsUsed.toFixed(2)}/$${limits.creditLimit}`);
    } else {
      console.log(`📊 Rate limit: ${provider}/${service} - Minute: ${minuteCount}, Day: ${dayCount}`);
    }
  } catch (error) {
    console.error("❌ Rate limit increment error:", error);
  }
}

/**
 * Get current rate limit status
 */
export async function getRateLimitStatus(provider, service) {
  if (!redis) {
    return { minute: 0, day: 0, credits: 0, limits: getRateLimit(provider, service) };
  }
  
  try {
    const limits = getRateLimit(provider, service);
    const minuteKey = getRateLimitKey(provider, service, "minute");
    const dayKey = getRateLimitKey(provider, service, "day");
    const creditKey = `ratelimit:${provider}:${service}:credits`;
    
    const [minuteCount, dayCount, creditsUsed] = await Promise.all([
      redis.get(minuteKey),
      redis.get(dayKey),
      limits.creditLimit ? redis.get(creditKey) : Promise.resolve("0")
    ]);
    
    const status = {
      minute: parseInt(minuteCount || "0"),
      day: parseInt(dayCount || "0"),
      limits,
      minuteRemaining: limits.requestsPerMinute - parseInt(minuteCount || "0"),
      dayRemaining: limits.requestsPerDay - parseInt(dayCount || "0")
    };
    
    if (limits.creditLimit) {
      status.credits = parseFloat(creditsUsed || "0");
      status.creditsRemaining = limits.creditLimit - parseFloat(creditsUsed || "0");
    }
    
    return status;
  } catch (error) {
    console.error("❌ Get rate limit status error:", error);
    return { minute: 0, day: 0, credits: 0, limits: getRateLimit(provider, service) };
  }
}

/**
 * Reset rate limits for a provider/service (for testing)
 */
export async function resetRateLimit(provider, service) {
  if (!redis) return;
  
  const minuteKey = getRateLimitKey(provider, service, "minute");
  const dayKey = getRateLimitKey(provider, service, "day");
  
  await Promise.all([
    redis.del(minuteKey),
    redis.del(dayKey)
  ]);
  
  console.log(`✅ Reset rate limits for ${provider}/${service}`);
}

/**
 * Close Redis connection
 */
export async function closeRateLimiter() {
  if (redis) {
    await redis.quit();
    console.log("✅ Rate limiter Redis closed");
  }
}

export { redis };
