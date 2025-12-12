// controllers/messageController.js
import { v4 as uuidv4 } from 'uuid';
import * as Qdrant from '../utils/qdrantHelper.js';
import * as LanceDB from '../utils/lancedbHelper.js';
import { generateEmbedding } from '../utils/embeddingHelper.js';

/**
 * Store message in both Qdrant and LanceDB (with message text)
 * @param {string} message_id - Original message ID from client (e.g., init_xxx)
 * @param {number[]} vector - Embedding vector
 * @param {string} room_id - Room ID
 * @param {string} sender_id - Sender ID
 * @param {string} sender_name - Sender name
 * @param {string} message_text - Message text content
 * @param {string} createdAt - Creation timestamp
 */
export async function storeMessage(message_id, vector, room_id, sender_id, sender_name, message_text, createdAt) {
    // Generate UUID for Qdrant point ID
    const qdrantId = uuidv4();

    // Store in Qdrant (UUID as point ID, original message_id in payload)
    await Qdrant.upsert(Qdrant.COLLECTIONS.MESSAGES, {
        id: qdrantId,
        vector,
        payload: {
            message_id,  // Original ID stored in payload
            room_id,
            sender_id,
            sender_name,
            message_text,
            createdAt
        }
    });

    // Store in LanceDB (using original message_id)
    await LanceDB.addMessage(message_id, vector, room_id, sender_id, sender_name, message_text, createdAt);
}

/**
 * Search messages in Qdrant
 */
export async function searchMessagesQdrant(queryVector, limit = 10, roomFilter = null, minScore = 0) {
    const filter = roomFilter ? {
        must: [{
            key: 'room_id',
            match: { value: roomFilter }
        }]
    } : null;

    const results = await Qdrant.search(Qdrant.COLLECTIONS.MESSAGES, queryVector, limit, filter);

    return results
        .filter(r => r.score >= minScore)
        .map(r => ({
            id: r.payload.message_id,  // Use message_id from payload, not Qdrant's UUID
            score: parseFloat(r.score.toFixed(4)),
            room_id: r.payload.room_id,
            sender_id: r.payload.sender_id,
            sender_name: r.payload.sender_name,
            message_text: r.payload.message_text,
            createdAt: r.payload.createdAt,
            source: 'qdrant'
        }));
}

/**
 * Search messages in LanceDB
 */
export async function searchMessagesLanceDB(queryVector, limit = 10, roomFilter = null, minScore = 0) {
    return await LanceDB.searchMessages(queryVector, limit, roomFilter, minScore);
}

/**
 * Search messages in both databases and return combined results
 */
export async function searchMessagesDual(queryVector, limit = 5, roomFilter = null, minScore = 0) {
    const [qdrantResults, lanceResults] = await Promise.all([
        searchMessagesQdrant(queryVector, limit, roomFilter, minScore),
        searchMessagesLanceDB(queryVector, limit, roomFilter, minScore)
    ]);

    return {
        qdrant: qdrantResults,
        lancedb: lanceResults,
        combined: {
            total: qdrantResults.length + lanceResults.length,
            qdrantCount: qdrantResults.length,
            lancedbCount: lanceResults.length
        }
    };
}

/**
 * Delete message from both databases
 * @param {string} message_id - Original message ID (not Qdrant's UUID)
 */
export async function deleteMessage(message_id) {
    // Delete from Qdrant using filter (since we don't have the UUID)
    await Qdrant.deleteByFilter(Qdrant.COLLECTIONS.MESSAGES, {
        must: [{
            key: 'message_id',
            match: { value: message_id }
        }]
    });

    // Delete from LanceDB
    await LanceDB.deleteMessage(message_id);
}

/**
 * Delete all messages in a room from both databases
 */
export async function deleteRoomMessages(roomId, embeddingSize = 384) {
    // Delete from Qdrant using filter
    await Qdrant.deleteByFilter(Qdrant.COLLECTIONS.MESSAGES, {
        must: [{
            key: 'room_id',
            match: { value: roomId }
        }]
    });

    // Delete from LanceDB
    return await LanceDB.deleteRoomMessages(roomId, embeddingSize);
}

/**
 * Get message count from Qdrant
 */
export async function getMessageCount() {
    return await Qdrant.count(Qdrant.COLLECTIONS.MESSAGES);
}

