// routes/aiRoutes.js
import express from 'express';
import { describeImage, extractText } from '../utils/aiProviders.js';
import { initializeQueues, getQueueStats } from '../queues/queueManager.js';
import { getRateLimitStatus } from '../utils/rateLimiter.js';

const router = express.Router();

// Audio transcription endpoint
router.post('/transcribe-audio', async (req, res) => {
    try {
        const { audioUrl } = req.body || {};
        if (!audioUrl) return res.status(400).json({ error: "audioUrl مطلوب" });

        const { transcribeAudio } = await import('../utils/aiProviders.js');
        const transcription = await transcribeAudio(audioUrl);

        return res.json({
            success: true,
            text: transcription,
            audioUrl
        });
    } catch (err) {
        console.error("Transcription Error:", err);
        return res.status(500).json({
            success: false,
            error: "Audio transcription failed",
            details: err.message
        });
    }
});

// Image description endpoint
router.post('/describe-image', async (req, res) => {
    try {
        const { imageUrl, prompt = "صف الصورة بشكل دقيق وبالعربية." } = req.body || {};
        if (!imageUrl) return res.status(400).json({ error: "imageUrl مطلوب" });

        const description = await describeImage(imageUrl, prompt);

        return res.json({
            success: true,
            description,
            imageUrl,
            prompt
        });
    } catch (err) {
        console.error("Image Description Error:", err);
        return res.status(500).json({
            success: false,
            error: "Image description failed",
            details: err.message
        });
    }
});

// OCR text extraction endpoint
router.post('/extract-text', async (req, res) => {
    try {
        const { imageUrl } = req.body || {};
        if (!imageUrl) return res.status(400).json({ error: "imageUrl مطلوب" });

        const extractedText = await extractText(imageUrl);

        return res.json({
            success: true,
            text: extractedText,
            imageUrl
        });
    } catch (err) {
        console.error("OCR Error:", err);
        return res.status(500).json({
            success: false,
            error: "Text extraction failed",
            details: err.message
        });
    }
});

// Get queue statistics
router.get('/queues/stats', async (req, res) => {
    try {
        const stats = await getQueueStats();
        res.json({
            success: true,
            queues: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get rate limit status for all providers/services
router.get('/rate-limits', async (req, res) => {
    try {
        const services = ["audioTranscription", "imageDescription", "imageOCR", "textGeneration"];
        const providers = ["groq", "gemini"];

        const limits = {};

        for (const provider of providers) {
            limits[provider] = {};
            for (const service of services) {
                try {
                    limits[provider][service] = await getRateLimitStatus(provider, service);
                } catch (error) {
                    limits[provider][service] = { error: error.message };
                }
            }
        }

        res.json({
            success: true,
            limits
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
