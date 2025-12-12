// routes/chatRoutes.js
import express from 'express';
import * as ChatController from '../controllers/chatController.js';
import * as AIChatMessageController from '../controllers/aiChatMessageController.js';

const router = express.Router();

// Chat endpoint with room context, user personalization, and message history
router.post('/', async (req, res) => {
    try {
        const { roomId, userId, userQuestion } = req.body;

        if (!roomId || !userId || !userQuestion) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: roomId, userId, and userQuestion are required'
            });
        }

        console.log(`💬 Chat Request from user ${userId} in room ${roomId}: "${userQuestion}"`);

        const result = await ChatController.generateChatResponse(
            roomId,
            userId,
            userQuestion,
            req.app.locals.config.embeddingSize
        );

        res.json(result);

    } catch (error) {
        console.error('❌ Error in POST /api/v1/chat:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate chat response',
            details: error.message
        });
    }
});

// Get AI chat history - filter by userId and/or roomId
router.get('/history', async (req, res) => {
    try {
        const { userId, roomId, limit } = req.query;
        console.log("userId, roomId, limit", userId, roomId, limit);

        if (!userId && !roomId) {
            return res.status(400).json({
                success: false,
                error: 'At least one filter is required: userId or roomId'
            });
        }

        console.log(`📜 Fetching AI chat history - userId: ${userId || 'all'}, roomId: ${roomId || 'all'}`);

        const filters = {
            user_id: userId || null,
            room_id: roomId || null,
            limit: limit ? parseInt(limit) : 50
        };

        const history = await AIChatMessageController.queryAIChatMessages(filters);

        res.json({
            success: true,
            count: history.length,
            filters: {
                userId: userId || null,
                roomId: roomId || null,
                limit: filters.limit
            },
            history
        });

    } catch (error) {
        console.error('❌ Error in GET /api/v1/chat/history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch AI chat history',
            details: error.message
        });
    }
});

// Delete AI chat history for a room (optionally filtered by user)
router.delete('/history/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const { userId } = req.query;

        console.log(`🗑️  Deleting AI chat history for room: ${roomId}${userId ? `, user: ${userId}` : ''}`);

        await AIChatMessageController.deleteRoomAIChatMessages(roomId, userId || null);

        res.json({
            success: true,
            message: 'AI chat history deleted successfully',
            roomId,
            userId: userId || 'all users'
        });

    } catch (error) {
        console.error('❌ Error in DELETE /api/v1/chat/history/:roomId:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete AI chat history',
            details: error.message
        });
    }
});

// Reply to a specific message on behalf of the sender
router.post('/reply', async (req, res) => {
    try {
        const { roomId, senderId, messageId } = req.body;

        if (!roomId || !senderId || !messageId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: roomId, senderId, and messageId are required'
            });
        }

        console.log(`💬 Reply Request for message ${messageId} in room ${roomId} by sender ${senderId}`);

        const result = await ChatController.generateMessageReply(
            roomId,
            senderId,
            messageId,
            req.app.locals.config.embeddingSize
        );

        res.json(result);

    } catch (error) {
        console.error('❌ Error in POST /api/v1/chat/reply:', error);

        // Handle specific error messages
        if (error.message === 'انتظر وحاول بعد لحظات') {
            return res.status(404).json({
                success: false,
                error: error.message
            });
        }

        if (error.message === 'لا يمكنك الرد على رسالتك الخاصة') {
            return res.status(403).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to generate message reply',
            details: error.message
        });
    }
});

export default router;

