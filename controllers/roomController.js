// controllers/roomController.js
import { v5 as uuidv5 } from 'uuid';
import * as Qdrant from '../utils/qdrantHelper.js';
import { enqueueTextGeneration } from '../utils/aiProviders.js';

// Namespace UUID for generating deterministic UUIDs for rooms
const ROOM_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Generate deterministic UUID for a room_id
 * Same room_id will always generate the same UUID
 */
function getRoomUUID(roomId) {
    return uuidv5(roomId, ROOM_NAMESPACE);
}

/**
 * Get room by ID
 * @param {string} roomId - Original room ID
 */
export async function getRoom(roomId) {
    // Use deterministic UUID to retrieve directly
    const uuid = getRoomUUID(roomId);
    const results = await Qdrant.retrieve(Qdrant.COLLECTIONS.ROOMS, [uuid]);

    if (results.length === 0) {
        return null;
    }

    return results[0].payload;
}

/**
 * Get all rooms
 */
export async function getAllRooms() {
    const points = await Qdrant.scrollAll(Qdrant.COLLECTIONS.ROOMS);
    return points.map(p => ({
        room_id: p.payload.room_id,  // Get room_id from payload
        ...p.payload
    }));
}

/**
 * Upsert room summary
 * Uses deterministic UUID so Qdrant's native upsert works correctly
 */
export async function upsertRoom(roomId, summary, messageCount = 0) {
    const zeroVector = new Array(384).fill(0);

    // Use deterministic UUID - same room_id always gets same UUID
    // This allows Qdrant's upsert to work natively (update if exists, insert if not)
    await Qdrant.upsert(Qdrant.COLLECTIONS.ROOMS, {
        id: getRoomUUID(roomId),  // Deterministic UUID based on room_id
        vector: zeroVector,
        payload: {
            room_id: roomId,  // Store original room_id in payload
            summary,
            messageCount
        }
    });
}

/**
 * Delete room
 */
export async function deleteRoom(roomId) {
    const uuid = getRoomUUID(roomId);
    await Qdrant.deletePoints(Qdrant.COLLECTIONS.ROOMS, [uuid]);
}

/**
 * Update room summary with AI
 */
export async function updateRoomSummary(roomId, newMessageText, fromName = null) {
    try {
        console.log(`📝 Updating summary for room: ${roomId}${fromName ? ` (from: ${fromName})` : ''}`);

        const existing = await getRoom(roomId);

        let oldSummary = "";
        let messageCount = 0;

        if (existing) {
            oldSummary = existing.summary || "";
            messageCount = existing.messageCount || 0;
        }

        // Generate new consolidated summary using LLM
        let newSummary = "";

        // Build message context with sender name if available
        const senderContext = fromName ? `[من: ${fromName}] ` : '';
        const messageWithContext = `${senderContext}${newMessageText}`;

        if (oldSummary) {
            const summaryPrompt = `لديك ملخص سابق لمحادثة في غرفة، ورسالة جديدة. قم بإنشاء ملخص محدث يدمج المعلومات المهمة من الملخص القديم مع الرسالة الجديدة. راعِ من أرسل الرسالة إذا كان الاسم متوفراً. يجب ألا يتجاوز الملخص النهائي 3000 حرف.\\n\\nالملخص السابق:\\n${oldSummary}\\n\\nالرسالة الجديدة:\\n${messageWithContext}\\n\\nالملخص المحدث (أقصى طول 3000 حرف):`;

            const job = await enqueueTextGeneration(
                summaryPrompt,
                "أنت مساعد متخصص في تلخيص المحادثات بشكل تراكمي ودقيق. راعِ أسماء المرسلين عند توفرها لفهم أفضل لسياق المحادثة. احتفظ بالمعلومات المهمة والمواضيع الرئيسية والتفاصيل ذات الصلة. الملخص النهائي يجب ألا يتجاوز 3000 حرف أبداً.",
                { maxTokens: 800, temperature: 0.4 }
            );

            const result = await job.finished();
            newSummary = (result.answer || "").trim().substring(0, 3000);
        } else {
            if (newMessageText.length > 200) {
                const summaryPrompt = `لخص المحادثة التالية بشكل موجز ودقيق، مع مراعاة من أرسل الرسالة إذا كان الاسم متوفراً:\\n\\n${messageWithContext}`;

                const job = await enqueueTextGeneration(
                    summaryPrompt,
                    "أنت مساعد متخصص في تلخيص المحادثات بشكل موجز ودقيق. راعِ أسماء المرسلين عند توفرها.",
                    { maxTokens: 700, temperature: 0.4 }
                );

                const result = await job.finished();
                newSummary = (result.answer || "").trim().substring(0, 3000);
            } else {
                newSummary = messageWithContext.substring(0, 3000);
            }
        }

        // Upsert new room record - Qdrant will update if exists, insert if not
        await upsertRoom(roomId, newSummary, messageCount + 1);

        console.log(`✅ Room summary updated for ${roomId} (${newSummary.length} chars, ${messageCount + 1} messages)`);
    } catch (error) {
        console.error(`❌ Error updating room summary for ${roomId}:`, error);
    }
}
