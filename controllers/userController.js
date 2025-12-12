// controllers/userController.js
import { v5 as uuidv5 } from 'uuid';
import * as Qdrant from '../utils/qdrantHelper.js';
import { enqueueTextGeneration } from '../utils/aiProviders.js';

// Namespace UUID for generating deterministic UUIDs for users
const USER_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

/**
 * Generate deterministic UUID for a user_id
 * Same user_id will always generate the same UUID
 */
function getUserUUID(userId) {
    return uuidv5(userId, USER_NAMESPACE);
}

/**
 * Get user by ID
 * @param {string} userId - Original user ID
 */
export async function getUser(userId) {
    // Use deterministic UUID to retrieve directly
    const uuid = getUserUUID(userId);
    const results = await Qdrant.retrieve(Qdrant.COLLECTIONS.USERS, [uuid]);

    if (results.length === 0) {
        return null;
    }

    return results[0].payload;
}

/**
 * Get all users
 */
export async function getAllUsers() {
    const points = await Qdrant.scrollAll(Qdrant.COLLECTIONS.USERS);
    return points.map(p => ({
        user_id: p.payload.user_id,  // Get user_id from payload
        ...p.payload
    }));
}

/**
 * Upsert user personalization summary
 * Uses deterministic UUID so Qdrant's native upsert works correctly
 */
export async function upsertUser(userId, personalizationSummary, messageCount = 0) {
    const zeroVector = new Array(384).fill(0);

    // Use deterministic UUID - same user_id always gets same UUID
    // This allows Qdrant's upsert to work natively (update if exists, insert if not)
    await Qdrant.upsert(Qdrant.COLLECTIONS.USERS, {
        id: getUserUUID(userId),  // Deterministic UUID based on user_id
        vector: zeroVector,
        payload: {
            user_id: userId,  // Store original user_id in payload
            personalization_summary: personalizationSummary,
            messageCount
        }
    });
}

/**
 * Delete user
 */
export async function deleteUser(userId) {
    const uuid = getUserUUID(userId);
    await Qdrant.deletePoints(Qdrant.COLLECTIONS.USERS, [uuid]);
}

/**
 * Update user personalization summary with AI
 */
export async function updateUserPersonalizationSummary(userId, newMessageText, fromName = null) {
    try {
        console.log(`📝 Updating personalization summary for user: ${userId}${fromName ? ` (${fromName})` : ''}`);

        const existing = await getUser(userId);

        let oldSummary = "";
        let messageCount = 0;

        if (existing) {
            oldSummary = existing.personalization_summary || "";
            messageCount = existing.messageCount || 0;
        }

        // Generate new consolidated personalization summary using LLM
        let newSummary = "";

        // Build message context with sender name if available
        const senderContext = fromName ? `[من: ${fromName}] ` : '';
        const messageWithContext = `${senderContext}${newMessageText}`;

        if (oldSummary) {
            const summaryPrompt = `لديك ملخص سابق لشخصية المستخدم وتفضيلاته، ورسالة جديدة منه. قم بإنشاء ملخص محدث يدمج المعلومات المهمة من الملخص القديم مع الرسالة الجديدة لبناء فهم أفضل لشخصية المستخدم وتفضيلاته وأسلوبه في التواصل. يجب ألا يتجاوز الملخص النهائي 3000 حرف.\\n\\nالملخص السابق:\\n${oldSummary}\\n\\nالرسالة الجديدة:\\n${messageWithContext}\\n\\nالملخص المحدث (أقصى طول 3000 حرف):`;

            const job = await enqueueTextGeneration(
                summaryPrompt,
                "أنت مساعد متخصص في بناء ملخصات شخصية للمستخدمين بناءً على رسائلهم وتفاعلاتهم. ركز على فهم شخصية المستخدم، تفضيلاته، أسلوبه في التواصل، اهتماماته، ونمط تفكيره. استخدم اسم المرسل إذا كان متوفراً لتحسين السياق. الملخص النهائي يجب ألا يتجاوز 3000 حرف أبداً.",
                { maxTokens: 800, temperature: 0.4 }
            );

            const result = await job.finished();
            newSummary = (result.answer || "").trim().substring(0, 3000);
        } else {
            if (newMessageText.length > 200) {
                const summaryPrompt = `بناءً على الرسالة التالية، قم بإنشاء ملخص شخصي للمستخدم يوضح تفضيلاته وأسلوبه في التواصل واهتماماته:\\n\\n${messageWithContext}`;

                const job = await enqueueTextGeneration(
                    summaryPrompt,
                    "أنت مساعد متخصص في بناء ملخصات شخصية للمستخدمين بناءً على رسائلهم. ركز على استخراج معلومات عن شخصية المستخدم، تفضيلاته، أسلوبه، واهتماماته. استخدم اسم المرسل إذا كان متوفراً.",
                    { maxTokens: 700, temperature: 0.4 }
                );

                const result = await job.finished();
                newSummary = (result.answer || "").trim().substring(0, 3000);
            } else {
                newSummary = messageWithContext.substring(0, 3000);
            }
        }

        // Upsert new user record - Qdrant will update if exists, insert if not
        await upsertUser(userId, newSummary, messageCount + 1);

        console.log(`✅ User personalization summary updated for ${userId} (${newSummary.length} chars, ${messageCount + 1} messages)`);
    } catch (error) {
        console.error(`❌ Error updating user personalization summary for ${userId}:`, error);
    }
}
