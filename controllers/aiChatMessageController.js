// controllers/aiChatMessageController.js
import * as Qdrant from '../utils/qdrantHelper.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Store AI chat message (user question + AI answer + suggested answer)
 */
export async function storeAIChatMessage(
    user_id,
    room_id,
    user_question,
    ai_answer,
    ai_suggested_answer,
    provider_name,
    model_name,
    createdAt = new Date().toISOString()
) {
    const id = uuidv4();

    // Sanitize strings to prevent JSON parsing issues
    const sanitizedQuestion = (user_question || '').toString().trim();
    const sanitizedAnswer = (ai_answer || '').toString().trim();
    const sanitizedSuggestedAnswer = ai_suggested_answer ? ai_suggested_answer.toString().trim() : null;

    // Create a simple embedding from the question for potential future semantic search
    // For now, we'll use a zero vector since we're primarily using this for history
    const dummyVector = new Array(384).fill(0);

    await Qdrant.upsert(Qdrant.COLLECTIONS.AI_CHAT_MESSAGES, {
        id,
        vector: dummyVector,
        payload: {
            user_id,
            room_id,
            user_question: sanitizedQuestion,
            ai_answer: sanitizedAnswer,
            ai_suggested_answer: sanitizedSuggestedAnswer,
            provider_name,
            model_name,
            createdAt
        }
    });

    return id;
}

/**
 * Get latest AI chat messages for a user in a room
 */
export async function getLatestAIChatMessages(user_id, room_id, limit = 5) {
    const filter = {
        must: [
            { key: 'user_id', match: { value: user_id } },
            { key: 'room_id', match: { value: room_id } }
        ]
    };

    const results = await Qdrant.scrollAll(
        Qdrant.COLLECTIONS.AI_CHAT_MESSAGES,
        filter,
        100 // Get up to 100, then we'll sort and limit
    );

    // Sort by createdAt descending and take the latest N
    const sorted = results
        .map(r => ({
            id: r.id,
            user_id: r.payload.user_id,
            room_id: r.payload.room_id,
            user_question: r.payload.user_question,
            ai_answer: r.payload.ai_answer,
            ai_suggested_answer: r.payload.ai_suggested_answer || null,
            provider_name: r.payload.provider_name,
            model_name: r.payload.model_name,
            createdAt: r.payload.createdAt
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

    return sorted;
}

/**
 * Query AI chat messages with flexible filters
 */
export async function queryAIChatMessages(filters = {}) {
    const { user_id, room_id, limit = 50 } = filters;

    const mustConditions = [];

    if (user_id) {
        mustConditions.push({ key: 'user_id', match: { value: user_id } });
    }

    if (room_id) {
        mustConditions.push({ key: 'room_id', match: { value: room_id } });
    }

    const filter = mustConditions.length > 0 ? { must: mustConditions } : null;

    const results = await Qdrant.scrollAll(
        Qdrant.COLLECTIONS.AI_CHAT_MESSAGES,
        filter,
        limit
    );

    // Sort by createdAt descending
    return results
        .map(r => ({
            id: r.id,
            user_id: r.payload.user_id,
            room_id: r.payload.room_id,
            user_question: r.payload.user_question,
            ai_answer: r.payload.ai_answer,
            ai_suggested_answer: r.payload.ai_suggested_answer || null,
            provider_name: r.payload.provider_name,
            model_name: r.payload.model_name,
            createdAt: r.payload.createdAt
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Delete AI chat message
 */
export async function deleteAIChatMessage(id) {
    await Qdrant.deletePoints(Qdrant.COLLECTIONS.AI_CHAT_MESSAGES, [id]);
}

/**
 * Delete all AI chat messages for a user in a room
 */
export async function deleteRoomAIChatMessages(room_id, user_id = null) {
    const mustConditions = [
        { key: 'room_id', match: { value: room_id } }
    ];

    if (user_id) {
        mustConditions.push({ key: 'user_id', match: { value: user_id } });
    }

    await Qdrant.deleteByFilter(Qdrant.COLLECTIONS.AI_CHAT_MESSAGES, {
        must: mustConditions
    });
}

/**
 * Get AI chat message count
 */
export async function getAIChatMessageCount(user_id = null, room_id = null) {
    const mustConditions = [];

    if (user_id) {
        mustConditions.push({ key: 'user_id', match: { value: user_id } });
    }

    if (room_id) {
        mustConditions.push({ key: 'room_id', match: { value: room_id } });
    }

    const filter = mustConditions.length > 0 ? { must: mustConditions } : null;

    return await Qdrant.count(Qdrant.COLLECTIONS.AI_CHAT_MESSAGES, filter);
}
