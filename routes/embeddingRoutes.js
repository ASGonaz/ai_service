// routes/embeddingRoutes.js
import express from 'express';
import { generateEmbedding, generateEmbeddingsBatch } from '../utils/embeddingHelper.js';
import { processMediaArray } from '../utils/mediaProcessor.js';
import * as MessageController from '../controllers/messageController.js';
import * as RoomController from '../controllers/roomController.js';
import * as UserController from '../controllers/userController.js';
import * as Qdrant from '../utils/qdrantHelper.js';
import * as LanceDB from '../utils/lancedbHelper.js';

const router = express.Router();

// Store messages with media processing (DUAL STORAGE: Qdrant + LanceDB)
// Simplified schema: only id, room_id, vector, sender_id, sender_name, createdAt
router.post('/messages', async (req, res) => {
    try {
        const startTime = Date.now();
        const { room, message, media = [], initId, createdAt, from, from_name } = req.body;

        if (!room || !initId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: room and initId'
            });
        }

        if (!message && (!media || media.length === 0)) {
            return res.status(400).json({
                success: false,
                error: 'Message must contain either text or media'
            });
        }

        let mediaProcessingResults = [];
        let extractedMediaTexts = [];

        if (media && media.length > 0) {
            console.log(`📎 Processing ${media.length} media file(s)...`);

            try {
                const { senderBackendUrl, senderBackendToken, senderBackendQuery } = req.app.locals.config;
                mediaProcessingResults = await processMediaArray(
                    media,
                    senderBackendUrl,
                    senderBackendToken,
                    senderBackendQuery
                );
                extractedMediaTexts = mediaProcessingResults
                    .filter(r => r.success && r.extractedText)
                    .map(r => r.extractedText);

                const failedMedia = mediaProcessingResults.filter(r => !r.success);
                if (failedMedia.length > 0) {
                    console.warn(`⚠️ Failed to process ${failedMedia.length} media file(s)`);
                }
            } catch (error) {
                console.error('❌ Media processing failed:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to process media',
                    details: error.message
                });
            }
        }

        const allTexts = [message, ...extractedMediaTexts].filter(Boolean);

        if (allTexts.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No processable content found in message or media'
            });
        }

        const combinedText = allTexts.join(' ');

        console.log('🔄 Generating embedding with "passage:" prefix...');
        const vector = await generateEmbedding(combinedText, 'passage');

        // Store in BOTH Qdrant and LanceDB (WITH message text for context)
        await MessageController.storeMessage(
            initId,
            vector,
            room,
            from || null,
            from_name || null,
            combinedText,  // ✨ NOW STORING MESSAGE TEXT!
            createdAt || new Date().toISOString()
        );

        const processingTime = Date.now() - startTime;
        console.log(`✅ Message stored successfully in both DBs (ID: ${initId}, ${processingTime}ms)`);

        // Update room summary asynchronously
        RoomController.updateRoomSummary(room, combinedText, from_name || null).catch(err => {
            console.error(`⚠️ Failed to update room summary for ${room}:`, err.message);
        });

        // Update user personalization summary asynchronously
        if (from) {
            UserController.updateUserPersonalizationSummary(from, combinedText, from_name || null).catch(err => {
                console.error(`⚠️ Failed to update user personalization summary for ${from}:`, err.message);
            });
        }

        res.json({
            success: true,
            message: 'Message processed and stored successfully in both databases',
            data: {
                id: initId,
                room_id: room,
                sender_id: from,
                sender_name: from_name,
                originalMessage: message,
                extractedFromMedia: extractedMediaTexts,
                combinedTextLength: combinedText.length,
                mediaProcessingResults,
                embeddingSize: vector.length,
                storedIn: ['qdrant', 'lancedb'],
                note: 'Text content not stored in vector DB (only embeddings) to save storage'
            },
            processingTime: `${processingTime}ms`
        });

    } catch (error) {
        console.error('❌ Error in POST /api/v1/embedding/messages:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process message',
            details: error.message
        });
    }
});

// Vector search (DUAL SEARCH: Returns results from both Qdrant and LanceDB)
router.post('/search', async (req, res) => {
    try {
        const startTime = Date.now();
        const { query, topK = 5, minScore = 0.5, room = null } = req.body;

        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: query'
            });
        }

        if (topK < 1 || topK > 100) {
            return res.status(400).json({
                success: false,
                error: 'topK must be between 1 and 100'
            });
        }

        console.log('🔍 Generating query embedding with "query:" prefix...');
        const queryVector = await generateEmbedding(query, 'query');

        // Search in BOTH databases
        const dualResults = await MessageController.searchMessagesDual(
            queryVector,
            topK,
            room,
            minScore
        );

        const processingTime = Date.now() - startTime;
        console.log(`✅ Dual search completed: Qdrant(${dualResults.qdrant.length}) + LanceDB(${dualResults.lancedb.length}) in ${processingTime}ms`);

        res.json({
            success: true,
            query,
            results: {
                qdrant: dualResults.qdrant,
                lancedb: dualResults.lancedb
            },
            metadata: {
                qdrantCount: dualResults.combined.qdrantCount,
                lancedbCount: dualResults.combined.lancedbCount,
                totalResults: dualResults.combined.total,
                topK,
                minScore,
                roomFilter: room || 'all',
                processingTime: `${processingTime}ms`,
                note: 'Results only contain metadata (no text) - text not stored in vector DB'
            }
        });

    } catch (error) {
        console.error('❌ Error in POST /api/v1/embedding/search:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search',
            details: error.message
        });
    }
});

// Get stats
router.get('/stats', async (req, res) => {
    try {
        const lanceDocsCount = await LanceDB.countMessages();

        const qdrantCount = await MessageController.getMessageCount();

        const { embeddingSize, embeddingModel } = req.app.locals.config;

        res.json({
            success: true,
            stats: {
                qdrant: {
                    documentsCount: qdrantCount,
                    primary: true
                },
                lancedb: {
                    documentsCount: lanceDocsCount,
                    dualStorage: true
                },
                embeddingSize,
                embeddingModel,
                schema: {
                    messages: ['id (UUID)', 'payload: {message_id, room_id, sender_id, sender_name, message_text, createdAt}', 'vector'],
                    rooms: ['id (UUID)', 'payload: {room_id, summary, messageCount}', 'vector'],
                    users: ['id (UUID)', 'payload: {user_id, personalization_summary, messageCount}', 'vector'],
                    note: 'Qdrant uses UUIDs as point IDs. Original IDs (message_id, room_id, user_id) are stored in payload for external system compatibility'
                },
                features: {
                    multilingualSupport: true,
                    supportedLanguages: '100+',
                    usesQueryPassagePrefixes: true,
                    mediaProcessing: true,
                    aiProviders: ['groq', 'gemini'],
                    dualStorage: ['qdrant', 'lancedb']
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete message
router.delete('/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await MessageController.deleteMessage(id);
        console.log(`🗑️  Deleted message from both DBs: ${id}`);
        res.json({
            success: true,
            message: 'Message deleted successfully from both databases',
            id
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete room data
router.delete('/rooms/:roomId', async (req, res) => {
    try {
        const startTime = Date.now();
        const { roomId } = req.params;

        if (!roomId) {
            return res.status(400).json({
                success: false,
                error: 'Room ID is required'
            });
        }

        // Delete messages from both databases
        const deletedCount = await MessageController.deleteRoomMessages(roomId);

        // Delete room summary from Qdrant
        await RoomController.deleteRoom(roomId);
        console.log(`🗑️  Deleted room summary for: ${roomId}`);

        const processingTime = Date.now() - startTime;
        console.log(`🗑️  Deleted ${deletedCount} messages from room: ${roomId}`);

        res.json({
            success: true,
            message: 'Room data deleted successfully from both databases',
            room: roomId,
            deletedCount,
            processingTime: `${processingTime}ms`
        });

    } catch (error) {
        console.error('❌ Error in DELETE /api/v1/embedding/rooms/:roomId:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete room data',
            details: error.message
        });
    }
});

// Get room summary (simplified payload - no lastUpdated)
router.get('/rooms/:roomId/summary', async (req, res) => {
    try {
        const { roomId } = req.params;

        if (!roomId) {
            return res.status(400).json({
                success: false,
                error: 'Room ID is required'
            });
        }

        const roomData = await RoomController.getRoom(roomId);

        if (!roomData) {
            return res.json({
                success: true,
                room: roomId,
                summary: "",
                messageCount: 0,
                exists: false
            });
        }

        res.json({
            success: true,
            room: roomId,
            summary: roomData.summary || "",
            messageCount: roomData.messageCount || 0,
            exists: true
        });

    } catch (error) {
        console.error('❌ Error in GET /api/v1/embedding/rooms/:roomId/summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get room summary',
            details: error.message
        });
    }
});

// Get user personalization summary (simplified payload - no lastUpdated)
router.get('/users/:userId/personalization-summary', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }

        const userData = await UserController.getUser(userId);

        if (!userData) {
            return res.json({
                success: true,
                user: userId,
                personalization_summary: "",
                messageCount: 0,
                exists: false
            });
        }

        res.json({
            success: true,
            user: userId,
            personalization_summary: userData.personalization_summary || "",
            messageCount: userData.messageCount || 0,
            exists: true
        });

    } catch (error) {
        console.error('❌ Error in GET /api/v1/embedding/users/:userId/personalization-summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user personalization summary',
            details: error.message
        });
    }
});

// DEBUG: Get all rooms (simplified payload - no lastUpdated)
router.get('/rooms/debug/all', async (req, res) => {
    try {
        const rooms = await RoomController.getAllRooms();

        const formattedRooms = rooms.map(r => ({
            room_id: r.room_id,
            messageCount: r.messageCount || 0,
            summaryLength: (r.summary || "").length
        }));

        res.json({
            success: true,
            count: formattedRooms.length,
            rooms: formattedRooms
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
