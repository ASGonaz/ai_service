// server.js (ESM) - Refactored with Qdrant Cloud
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initializeProviders } from "./utils/aiProviders.js";
import { initializeEmbedder, CONFIG as EMBEDDING_CONFIG } from "./utils/embeddingHelper.js";
import { initializeQueues } from "./queues/queueManager.js";
import { initializeRateLimiter } from "./utils/rateLimiter.js";
import { QUEUE_CONFIG } from "./config/aiModels.js";
import * as QdrantHelper from "./utils/qdrantHelper.js";
import * as LanceDBHelper from "./utils/lancedbHelper.js";

// Import routes
import embeddingRoutes from "./routes/embeddingRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import { seedTestMessages } from "./test-vectordb.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ==================== Configuration ====================
const CONFIG = {
    port: process.env.PORT || 3004,
    dbPath: process.env.DB_PATH || './lancedb_data',
    tableName: process.env.TABLE_NAME || 'messages',
    embeddingSize: EMBEDDING_CONFIG.embeddingSize,
    embeddingModel: EMBEDDING_CONFIG.embeddingModel,
    senderBackendUrl: process.env.SENDER_BACKEND_URL || 'http://localhost:3000',
    senderBackendToken: process.env.SENDER_BACKEND_MEDIA_EXCEPTION_TOKEN || '',
    senderBackendQuery: process.env.SENDER_BACKEND_MEDIA_EXCEPTION_QUERY || '',
    qdrantUrl: process.env.QDRANT_URL || '',
    qdrantApiKey: process.env.QDRANT_API_KEY || ''
};

// ==================== Global State ====================
let isReady = false;

// Initialize AI providers
initializeProviders(
    process.env.GROQ_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.DEEPGRAM_API_KEY,
    process.env.ASSEMBLYAI_API_KEY
);

// Initialize Redis rate limiter
console.log("🔄 Initializing rate limiter...");
initializeRateLimiter(QUEUE_CONFIG.redis);

// Initialize Bull queues
console.log("🔄 Initializing queues...");
initializeQueues();

// Warnings for missing API keys
if (!process.env.GROQ_API_KEY) {
    console.warn("⚠️ GROQ_API_KEY is not set. AI features will be limited.");
}
if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️ GEMINI_API_KEY is not set. Some AI features will be unavailable.");
}
if (!process.env.DEEPGRAM_API_KEY) {
    console.warn("⚠️ DEEPGRAM_API_KEY is not set. Audio transcription fallback #1 unavailable.");
}
if (!process.env.ASSEMBLYAI_API_KEY) {
    console.warn("⚠️ ASSEMBLYAI_API_KEY is not set. Audio transcription fallback #2 unavailable.");
}

// ==================== Initialization ====================
async function initialize() {
    try {
        console.log('🔄 Starting initialization...');

        // Initialize Qdrant Cloud (primary vector DB)
        if (!CONFIG.qdrantUrl || !CONFIG.qdrantApiKey) {
            throw new Error('⚠️ QDRANT_URL and QDRANT_API_KEY must be set in .env file');
        }

        await QdrantHelper.initializeQdrant(CONFIG.qdrantUrl, CONFIG.qdrantApiKey, CONFIG.embeddingSize);

        // Initialize LanceDB (for messages dual storage)
        await LanceDBHelper.initializeLanceDB(CONFIG.dbPath, CONFIG.embeddingSize);

        // Initialize embedding model
        await initializeEmbedder();

        // Get document counts
        const lanceDocsCount = await LanceDBHelper.countMessages();
        console.log(`📊 Total documents in LanceDB: ${lanceDocsCount}`);

        const qdrantCount = await QdrantHelper.count(QdrantHelper.COLLECTIONS.MESSAGES);
        console.log(`📊 Total documents in Qdrant: ${qdrantCount}`);

        // Store config in app.locals for routes
        app.locals.config = CONFIG;

        isReady = true;
        console.log('🎉 System ready!\n');
        //await seedTestMessages();
        //console.log('SUCCESS');
        return true;
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        isReady = false;
        throw error;
    }
}

// ==================== Middleware ====================
function ensureReady(req, res, next) {
    if (!isReady) {
        return res.status(503).json({
            success: false,
            error: 'System is initializing. Please wait...'
        });
    }
    next();
}

// ==================== Routes ====================

// Health check
app.get("/health", async (req, res) => {
    const status = {
        ok: isReady,
        groqKey: !!process.env.GROQ_API_KEY,
        geminiKey: !!process.env.GEMINI_API_KEY,
        qdrantUrl: !!CONFIG.qdrantUrl,
        qdrantApiKey: !!CONFIG.qdrantApiKey,
        lancedbConnected: LanceDBHelper.isReady(),
        embeddingModel: CONFIG.embeddingModel,
        embeddingSize: CONFIG.embeddingSize
    };
    res.json(status);
});

// Mount routes
app.use('/api/v1/embedding', ensureReady, embeddingRoutes);
app.use('/api/v1/chat', ensureReady, chatRoutes);
app.use('/', aiRoutes);

// ==================== Server Startup ====================
async function startServer() {
    try {
        await initialize();

        app.listen(CONFIG.port, () => {
            console.log('='.repeat(70));
            console.log(`🚀 Server running on http://localhost:${CONFIG.port}`);
            console.log(`🤖 Embedding: ${CONFIG.embeddingModel} (${CONFIG.embeddingSize}d)`);
            console.log(`🧠 AI Providers:`);
            console.log(`   • Groq (primary)`);
            console.log(`   • Gemini (vision & LLM)`);
            console.log(`   • Deepgram (audio fallback #1)`);
            console.log(`   • AssemblyAI (audio fallback #2)`);
            console.log(`💾 Databases:`);
            console.log(`   • Qdrant Cloud (primary) - ${CONFIG.qdrantUrl}`);
            console.log(`   • LanceDB (dual storage) - ${CONFIG.dbPath}`);
            console.log(`🔴 Redis: ${QUEUE_CONFIG.redis.host}:${QUEUE_CONFIG.redis.port}`);
            console.log('='.repeat(70));
            console.log('\n✅ Features:');
            console.log('  • Vector embeddings (multilingual)');
            console.log('  • Dual storage (Qdrant + LanceDB for messages)');
            console.log('  • Audio transcription (Groq → Deepgram → AssemblyAI)');
            console.log('  • Image description (Groq Vision / Gemini Vision)');
            console.log('  • OCR text extraction (Arabic + English)');
            console.log('  • RAG Q&A (Qdrant + Groq LLM / Gemini)');
            console.log('  • Media processing with AI fallback');
            console.log('  • Queue-based job processing');
            console.log('  • Automatic rate limiting with credit tracking');
            console.log('  • Room summaries (Qdrant)');
            console.log('  • User personalization (Qdrant)');
            console.log('  • AI chat history tracking (Qdrant)');
            console.log('\n📚 Endpoints:');
            console.log('  GET    /health');
            console.log('  POST   /transcribe-audio           - Audio → Text');
            console.log('  POST   /describe-image             - Image → Description');
            console.log('  POST   /extract-text               - Image → Text (OCR) 📝');
            console.log('  POST   /api/v1/embedding/messages  - Store with media (Dual: Qdrant + LanceDB) 💾💾');
            console.log('  POST   /api/v1/embedding/search    - Dual search (Qdrant + LanceDB) 🔍🔍');
            console.log('  POST   /api/v1/chat                - Chat with Context + History 💬✨🧠');
            console.log('  GET    /api/v1/chat/history        - Get AI chat history 📜');
            console.log('  DELETE /api/v1/chat/history/:roomId - Delete AI chat history 🗑️');
            console.log('  GET    /api/v1/embedding/stats');
            console.log('  GET    /api/v1/queues/stats        - Queue status 📊');
            console.log('  GET    /api/v1/rate-limits         - Rate limit status 🚦');
            console.log('  GET    /api/v1/embedding/rooms/:roomId/summary');
            console.log('  GET    /api/v1/embedding/users/:userId/personalization-summary');
            console.log('  DELETE /api/v1/embedding/messages/:id');
            console.log('  DELETE /api/v1/embedding/rooms/:roomId');
            console.log('\n⚠️  Remember to start workers: npm run worker');
            console.log('\n');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
