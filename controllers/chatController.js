// controllers/chatController.js - ENHANCED VERSION WITH MESSAGE TEXT
import * as Qdrant from '../utils/qdrantHelper.js';
import { generateEmbedding } from '../utils/embeddingHelper.js';
import { enqueueTextGeneration } from '../utils/aiProviders.js';
import { getRoom } from './roomController.js';
import { getUser } from './userController.js';
import * as AIChatMessageController from './aiChatMessageController.js';

/**
 * Parse chat model response to extract answer and suggested answer
 */
function parseChatModelResponse(rawText) {
    const defaultResult = {
        answer: rawText.trim(),
        suggestedAnswer: null
    };

    if (!rawText) {
        return defaultResult;
    }

    // First, try to strip markdown code blocks (```json ... ```)
    let cleanedText = rawText.trim();

    // Remove markdown code block wrapper if present
    const markdownMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (markdownMatch) {
        cleanedText = markdownMatch[1].trim();
    }

    // Attempt to locate JSON object within the text
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return defaultResult;
    }

    try {
        const parsed = JSON.parse(jsonMatch[0]);
        let answer = (parsed.answer || parsed.Answer || '').trim();
        let suggested = (parsed.suggested_answer || parsed.suggestedAnswer || '').trim();

        // Clean up answer if it still contains markdown artifacts
        if (answer.includes('```')) {
            const answerMarkdownMatch = answer.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (answerMarkdownMatch) {
                answer = answerMarkdownMatch[1].trim();
            }
        }

        // If answer is still JSON, try to parse it one more time
        if (answer.startsWith('{') && answer.endsWith('}')) {
            try {
                const innerParsed = JSON.parse(answer);
                if (innerParsed.answer) {
                    answer = innerParsed.answer.trim();
                    if (!suggested && innerParsed.suggested_answer) {
                        suggested = innerParsed.suggested_answer.trim();
                    }
                }
            } catch {
                // If inner parsing fails, keep the original answer
            }
        }

        return {
            answer: answer || defaultResult.answer,
            suggestedAnswer: suggested || null
        };
    } catch (err) {
        console.warn('⚠️ Failed to parse chat model JSON response:', err.message);

        // Fallback: Try regex extraction for malformed JSON (e.g. unescaped quotes)
        try {
            const answerMatch = jsonMatch[0].match(/"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"suggested_answer"/);
            const suggestedMatch = jsonMatch[0].match(/"suggested_answer"\s*:\s*"([\s\S]*?)"\s*\}/);

            if (answerMatch) {
                console.log('⚠️ Recovered content using Regex fallback');
                return {
                    answer: answerMatch[1].trim(),
                    suggestedAnswer: suggestedMatch ? suggestedMatch[1].trim() : null
                };
            }
        } catch (regexErr) {
            console.warn('⚠️ Regex fallback also failed:', regexErr.message);
        }

        return defaultResult;
    }
}

/**
 * Build context-aware prompt with better structure and ACTUAL MESSAGE TEXT
 */
function buildEnhancedPrompt(data) {
    const {
        userQuestion,
        userId,
        roomSummary,
        userPersonalization,
        aiChatHistory,
        latestMessages
    } = data;

    let prompt = '';

    // 1. System Context (if available)
    const hasContext = roomSummary || userPersonalization || aiChatHistory.length > 0 ||
        latestMessages.length > 0;

    if (hasContext) {
        prompt += `# السياق المتاح\n\n`;

        // Room context
        if (roomSummary) {
            prompt += `## سياق الغرفة:\n${roomSummary}\n\n`;
        }

        // User personalization
        if (userPersonalization) {
            prompt += `## معلومات عن المستخدم:\n${userPersonalization}\n\n`;
        }

        // AI Chat History (most important for continuity)
        if (aiChatHistory.length > 0) {
            prompt += `## المحادثات السابقة مع هذا المستخدم:\n`;
            aiChatHistory.reverse().forEach((chat, idx) => {
                prompt += `\n**محادثة ${idx + 1}** (${formatTimestamp(chat.createdAt)}):\n`;
                prompt += `👤 المستخدم: ${chat.user_question}\n`;
                prompt += `🤖 ميجو (أنت): ${chat.ai_answer}\n`;
            });
            prompt += `\n`;
        }

        // Removed relevant messages section - using only latest messages now

        // Recent activity context (WITH ACTUAL TEXT!)
        if (latestMessages.length > 0 && latestMessages.some(m => m.message_text)) {
            prompt += `## آخر الرسائل في الغرفة:\n`;
            latestMessages.forEach((msg, idx) => {
                if (msg.message_text) {
                    const senderLabel = msg.sender_id === userId ? 'أنت' :
                        (msg.sender_name || msg.sender_id || 'مستخدم');
                    const timeAgo = getTimeAgo(msg.createdAt);
                    prompt += `\n[رسالة #${idx + 1}]\n`;
                    prompt += `📤 المرسل: **${senderLabel}**\n`;
                    prompt += `⏰ الوقت: ${timeAgo}\n`;
                    prompt += `💬 المحتوى: "${msg.message_text}"\n`;
                    prompt += `🔗 معرف الرسالة: ${msg.id}\n`;
                }
            });
            prompt += `\n`;
        }
    }

    // 2. Current Question
    prompt += `# السؤال الحالي\n\n`;
    prompt += `👤 المستخدم: ${userQuestion}\n\n`;
    prompt += `⚠️ **مهم جداً**: ركز على هذا السؤال فقط! لا تجاوب على أسئلة سابقة.\n\n`;

    // 3. Instructions (clear and concise)
    prompt += `# التعليمات\n\n`;
    prompt += `**دورك**: أنت عضو نشط في هذه الغرفة، وليس مجرد مساعد خارجي.\n\n`;

    if (hasContext) {
        prompt += `**كيف تتصرف كعضو في الغرفة:**\n`;
        prompt += `1. يمكن سؤالك عن أي رسالة سابقة (رسائلك أو رسائل الأعضاء الآخرين)\n`;
        prompt += `2. يمكن طلب منك الرد على رسالة محددة - راجع الرسائل أعلاه وحدد الرسالة المقصودة\n`;
        prompt += `3. استخدم السياق المتاح (المحادثات السابقة والرسائل) لفهم الموقف\n`;
        if (aiChatHistory.length > 0) {
            prompt += `4. راجع محادثاتك السابقة مع هذا المستخدم للحفاظ على الاستمرارية\n`;
        }
        if (latestMessages.length > 0) {
            prompt += `5. آخر الرسائل تعطيك صورة عن النقاش الحالي\n`;
        }
        prompt += `6. إذا سُئلت عن "آخر رسالة" أو "رسالة سابقة"، ارجع للرسائل المعروضة أعلاه\n`;
        prompt += `7. يمكنك الإشارة إلى رسائل محددة بذكر اسم المرسل أو الوقت\n`;
        prompt += `8. قدم اقتراحات ذكية ومفيدة عندما يكون ذلك مناسباً\n`;
        prompt += `9. كن طبيعياً ومتفاعلاً كأنك جزء من المحادثة\n`;
    } else {
        prompt += `**ملاحظة**: لا يوجد سياق متاح حالياً\n`;
        prompt += `1. أجب على السؤال بشكل عام ومفيد\n`;
        prompt += `2. يمكنك طلب المزيد من المعلومات إذا لزم الأمر\n`;
        prompt += `3. اعتذر بلطف إذا كان السؤال يتطلب سياقاً غير متوفر\n`;
    }

    prompt += `\n**صيغة الإجابة:**\n`;
    prompt += `- اكتب بالعربية الفصحى الواضحة\n`;
    prompt += `- قدم إجابتين:\n`;
    prompt += `  * "answer": إجابة مفصلة ودقيقة (يمكن أن تشير لرسائل محددة)\n`;
    prompt += `  * "suggested_answer": رد مختصر وجاهز للاستخدام\n\n`;

    // 4. Output format
    prompt += `# صيغة الإخراج (JSON فقط)\n\n`;
    prompt += `⚠️ **تنبيه**: تأكد من أن النص داخل JSON لا يحتوي على علامات تنصيص غير معالجة (unescaped quotes).\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "answer": "إجابتك المفصلة هنا",\n`;
    prompt += `  "suggested_answer": "رد مختصر هنا"\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n`;

    return prompt;
}

/**
 * Format timestamp to relative time
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    return date.toLocaleDateString('ar');
}

/**
 * Get time ago string
 */
function getTimeAgo(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 60) return `منذ ${diffMins}د`;
    if (diffHours < 24) return `منذ ${diffHours}س`;
    return formatTimestamp(timestamp);
}

/**
 * Enhanced chat response generation with better context and prompt engineering
 * NOW WITH ACTUAL MESSAGE TEXT!
 */
export async function generateChatResponse(roomId, userId, userQuestion, embeddingSize = 384) {
    const startTime = Date.now();

    try {
        // 1. Fetch all context in parallel for better performance
        console.log('🔄 Fetching context data...');
        const [roomData, userData, aiChatHistory] = await Promise.all([
            getRoom(roomId).catch(() => null),
            getUser(userId).catch(() => null),
            AIChatMessageController.getLatestAIChatMessages(userId, roomId, 5).catch(() => [])
        ]);


        const roomSummary = roomData?.summary || '';
        const userPersonalization = userData?.personalization_summary || '';

        // 2. Generate embedding for semantic search
        console.log('🔍 Fetching latest messages...');
        // Removed queryVector generation - not needed anymore

        // 3. Fetch latest messages from room
        const allRoomMessages = await Qdrant.scrollAll(
            Qdrant.COLLECTIONS.MESSAGES,
            {
                must: [{
                    key: 'room_id',
                    match: { value: roomId }
                }]
            },
            15
        ).catch(() => []);

        console.log(`📊 Retrieved ${allRoomMessages.length} total room messages from Qdrant`);

        // Get latest messages (sorted by time)
        const latestMessages = allRoomMessages
            .map(p => ({
                id: p.id,
                sender_id: p.payload.sender_id,
                sender_name: p.payload.sender_name,
                message_text: p.payload.message_text,
                createdAt: p.payload.createdAt
            }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        console.log(`📊 Latest messages: ${latestMessages.length}`);

        // 4. Build enhanced prompt
        console.log('📝 Building enhanced prompt...');
        const prompt = buildEnhancedPrompt({
            userQuestion,
            userId,
            roomSummary,
            userPersonalization,
            aiChatHistory,
            latestMessages: latestMessages
        });

        // 5. Enhanced system prompt - AI as room member named 'ميجو'
        const systemPrompt = `اسمك "ميجو" وأنت عضو نشط ومساعد ذكي في هذه الغرفة. دورك المزدوج:

**هويتك:**
- اسمك: ميجو
- عندما ينادي عليك أحد باسمك (مثل: "يا ميجو" أو "ميجو، ساعدني")، اعرف أن الطلب موجه لك مباشرة
- لكن كن ذكياً: حتى لو لم يذكر أحد اسمك، إذا كان السؤال أو الطلب واضح، أجب عليه
- لا تنتظر دائماً أن يُنادى عليك باسمك - كن استباقياً ومفيداً

**اللغة والأسلوب:**
- 🇪🇬 **اللغة الأساسية**: العامية المصرية (معظم المحادثات ستكون بالعامية)
- 📚 **اللغة الثانوية**: العربية الفصحى
- 🌍 **اللغة الثالثة**: الإنجليزية (أحياناً)
- 🎯 **القاعدة الذهبية**: رد بنفس اللغة والأسلوب اللي المستخدم بيتكلم بيه
  * إذا كلمك بالعامية → رد بالعامية
  * إذا كلمك بالفصحى → رد بالفصحى
  * إذا كلمك بالإنجليزي → رد بالإنجليزي
  * إذا خلط بين اللغات → رد بنفس الأسلوب المختلط

**كعضو في الغرفة:**
- يمكن سؤالك عن أي رسالة سابقة (رسائلك أو رسائل الأعضاء الآخرين)
- يمكن طلب منك الرد على رسالة محددة أو التعليق عليها
- أنت جزء من المحادثة وليس مجرد مراقب خارجي
- يمكنك الإشارة إلى رسائل سابقة بذكر المرسل أو التوقيت

**كمساعد ذكي:**
- تقدم اقتراحات مفيدة وذكية
- تفهم السياق من المحادثات والرسائل السابقة
- تحافظ على استمرارية المحادثة
- تجيب بنفس أسلوب المستخدم (عامية/فصحى/إنجليزي)

**التعامل مع المحادثات الطبيعية:**
- 🤝 التحيات والسلامات: رد بشكل ودود وطبيعي
- 💬 الأسئلة البسيطة: لا تبالغ في الرد - كن طبيعياً ومختصراً
- 😊 افهم العامية المصرية: "عامل إيه"، "إزيك"، "ماشي"، "تمام"، "كويس"، إلخ
- 🎯 رد بنفس مستوى الرسمية: إذا كان السؤال غير رسمي، رد بشكل ودود وبسيط
- ⚠️ لا تطلب تفاصيل إضافية للتحيات البسيطة - فقط رد بشكل طبيعي

**أمثلة على الردود الطبيعية بالعامية:**
- "عامل إيه يا ميجو؟" → "تمام الحمد لله! وأنت عامل إيه؟ 😊"
- "إزيك يا ميجو؟" → "كويس الحمد لله! إزيك أنت؟"
- "ممكن تساعدني في حاجة؟" → "أكيد! قول عايز إيه؟"
- "شكراً يا ميجو" → "العفو! أي خدمة 😊"
- "فهمت؟" → "آه فهمت، تمام"

**أمثلة بالفصحى:**
- "السلام عليكم" → "وعليكم السلام! أهلاً بك 😊"
- "صباح الخير" → "صباح النور! 🌅"

**أمثلة بالإنجليزي:**
- "How are you Migo?" → "I'm good, thanks! How about you? 😊"
- "Can you help me?" → "Of course! What do you need?"

**قواعد مهمة:**
1. إذا سُئلت عن "آخر رسالة" أو "رسالة سابقة"، ارجع للرسائل المعروضة في السياق
2. إذا طُلب منك الرد على رسالة محددة، حدد الرسالة أولاً ثم قدم ردك
3. استخدم المعلومات المتاحة بذكاء ولا تخترع معلومات غير موجودة
4. كن طبيعياً ومتفاعلاً كأنك عضو حقيقي في الغرفة
5. الالتزام التام بصيغة JSON المطلوبة في الإخراج

**قواعد الذكاء والاختصار:**
6. ⚠️ قد تجد بعض الرسائل متكررة في السياق - تجاهل التكرار ولا تعلق عليه
7. 🎯 ركز على السؤال الحالي فقط - لا تجاوب على أسئلة سابقة إلا إذا كانت مرتبطة مباشرة
8. ✂️ كن مختصراً ومباشراً - لا تكتب إجابات طويلة إلا إذا كان السؤال يتطلب ذلك
9. 🧠 إذا كان السؤال بسيط، قدم إجابة بسيطة - لا تبالغ في التفاصيل
10. 💡 في "suggested_answer" قدم رد جاهز قصير جداً (سطر أو سطرين فقط)
11. 👤 عندما يُذكر اسمك "ميجو"، اعرف أن الطلب لك مباشرة - لكن لا تشترط ذكر اسمك للرد
12. 🚫 لا تكن رسمياً جداً في الردود البسيطة - كن ودوداً وطبيعياً كأنك صديق
13. 🇪🇬 اتقن العامية المصرية واستخدمها بطلاقة - دي اللغة الأساسية للمحادثات`;

        // 6. Generate response with optimized parameters
        console.log('🧠 Generating AI response...');
        const generationStart = Date.now();

        const job = await enqueueTextGeneration(
            prompt,
            systemPrompt,
            {
                maxTokens: 1500,      // Increased for better answers
                temperature: 0.5      // Lower for more consistent responses
            }
        );

        const result = await job.finished();
        const provider = result.provider || result.metadata?.provider || 'unknown';
        const model = result.model || result.metadata?.model || 'unknown';
        const rawModelOutput = (result.answer || '').trim();
        const { answer, suggestedAnswer } = parseChatModelResponse(rawModelOutput);

        const generationTime = Date.now() - generationStart;
        const totalTime = Date.now() - startTime;

        console.log(`✅ Chat response generated (${generationTime}ms)`);
        console.log(`📊 Parsed answer length: ${answer.length} chars, Suggested: ${suggestedAnswer ? 'Yes' : 'No'}`);

        // 7. Store interaction asynchronously (don't wait)
        console.log('💾 Storing AI chat interaction...');
        AIChatMessageController.storeAIChatMessage(
            userId,
            roomId,
            userQuestion,
            answer,
            suggestedAnswer,
            provider,
            model
        ).then(() => {
            console.log('✅ AI chat interaction stored successfully');
        }).catch(error => {
            console.error('⚠️ Failed to store AI chat interaction:', error.message);
        });

        // 8. Return enhanced response
        return {
            success: true,
            answer,
            suggestedAnswer,
            provider,
            model,
            question: userQuestion,
            context: {
                roomId,
                userId,
                hasRoomSummary: !!roomSummary,
                hasUserPersonalization: !!userPersonalization,
                latestMessagesCount: latestMessages.length,
                aiChatHistoryCount: aiChatHistory.length,
                hasMessageText: latestMessages.some(m => m.message_text),
                contextQuality: calculateContextQuality({
                    roomSummary,
                    userPersonalization,
                    aiChatHistory,
                    latestMessages: latestMessages
                })
            },
            metadata: {
                generationTime: `${generationTime}ms`,
                totalTime: `${totalTime}ms`,
                latestMessagesCount: latestMessages.length,
                aiChatHistoryCount: aiChatHistory.length,
                provider,
                model
            },
            prompt: {
                systemPrompt: systemPrompt,
                prompt: prompt
            }
        };

    } catch (error) {
        console.error('❌ Error in generateChatResponse:', error);
        throw error;
    }
}

/**
 * Build prompt for replying to a specific message
 */
function buildReplyPrompt(data) {
    const {
        targetMessage,
        senderId,
        roomSummary,
        userPersonalization,
        latestMessages
    } = data;

    let prompt = '';

    // 1. System Context
    const hasContext = roomSummary || userPersonalization || latestMessages.length > 0;

    if (hasContext) {
        prompt += `# السياق المتاح\n\n`;

        // Room context
        if (roomSummary) {
            prompt += `## سياق الغرفة:\n${roomSummary}\n\n`;
        }

        // User personalization
        if (userPersonalization) {
            prompt += `## معلومات عن المرسل:\n${userPersonalization}\n\n`;
        }

        // Recent messages context
        if (latestMessages.length > 0 && latestMessages.some(m => m.message_text)) {
            prompt += `## آخر الرسائل في الغرفة:\n`;
            latestMessages.forEach((msg, idx) => {
                if (msg.message_text) {
                    const senderLabel = msg.sender_id === senderId ? 'المرسل الأصلي' :
                        (msg.sender_name || msg.sender_id || 'مستخدم');
                    const timeAgo = getTimeAgo(msg.createdAt);
                    const isTarget = msg.id === targetMessage.id;
                    prompt += `\n[رسالة #${idx + 1}${isTarget ? ' ⭐ الرسالة المطلوب الرد عليها' : ''}]\n`;
                    prompt += `📤 المرسل: **${senderLabel}**\n`;
                    prompt += `⏰ الوقت: ${timeAgo}\n`;
                    prompt += `💬 المحتوى: "${msg.message_text}"\n`;
                    prompt += `🔗 معرف الرسالة: ${msg.id}\n`;
                }
            });
            prompt += `\n`;
        }
    }

    // 2. Target Message (highlighted)
    prompt += `# الرسالة المطلوب الرد عليها\n\n`;
    prompt += `⭐ **هذه هي الرسالة التي يجب أن ترد عليها بدلاً من المرسل:**\n\n`;
    prompt += `📤 المرسل: **${targetMessage.sender_name || targetMessage.sender_id}**\n`;
    prompt += `⏰ الوقت: ${formatTimestamp(targetMessage.createdAt)}\n`;
    prompt += `💬 المحتوى: "${targetMessage.message_text}"\n`;
    prompt += `🔗 معرف الرسالة: ${targetMessage.id}\n\n`;

    // 3. Instructions
    prompt += `# التعليمات\n\n`;
    prompt += `**دورك**: أنت تقوم بالرد على الرسالة أعلاه بدلاً من المرسل الأصلي.\n\n`;

    prompt += `**كيف ترد:**\n`;
    prompt += `1. اقرأ الرسالة المطلوب الرد عليها بعناية\n`;
    prompt += `2. افهم السياق من الرسائل الأخرى في الغرفة\n`;
    prompt += `3. قدم رداً مناسباً ومفيداً كأنك المرسل نفسه\n`;
    prompt += `4. كن طبيعياً ومتناسقاً مع أسلوب المحادثة\n`;
    prompt += `5. رد بنفس اللغة والأسلوب المستخدم في الرسالة (عامية/فصحى/إنجليزي)\n`;
    prompt += `6. كن مختصراً ومباشراً - قدم رداً واحداً واضحاً\n`;
    prompt += `7. لا تذكر أنك AI أو أنك ترد بدلاً من شخص - فقط قدم الرد مباشرة\n\n`;

    prompt += `**صيغة الإجابة:**\n`;
    prompt += `- رد واحد فقط في حقل "answer"\n`;
    prompt += `- يمكنك ترك "suggested_answer" فارغاً أو تقديم بديل أقصر\n\n`;

    // 4. Output format
    prompt += `# صيغة الإخراج (JSON فقط)\n\n`;
    prompt += `⚠️ **تنبيه**: تأكد من أن النص داخل JSON لا يحتوي على علامات تنصيص غير معالجة.\n`;
    prompt += `\`\`\`json\n`;
    prompt += `{\n`;
    prompt += `  "answer": "ردك على الرسالة هنا",\n`;
    prompt += `  "suggested_answer": "رد بديل أقصر (اختياري)"\n`;
    prompt += `}\n`;
    prompt += `\`\`\`\n`;

    return prompt;
}

/**
 * Generate reply to a specific message on behalf of the sender
 */
export async function generateMessageReply(roomId, senderId, messageId, embeddingSize = 384) {
    const startTime = Date.now();

    try {
        console.log(`🔄 Generating reply for message ${messageId} in room ${roomId}...`);

        // 1. Fetch the target message from Qdrant
        const targetMessageResults = await Qdrant.scrollAll(
            Qdrant.COLLECTIONS.MESSAGES,
            {
                must: [
                    {
                        key: 'message_id',
                        match: { value: messageId }
                    },
                    {
                        key: 'room_id',
                        match: { value: roomId }
                    }
                ]
            },
            1
        ).catch(() => []);
        console.log('targetMessageResults', roomId, senderId, messageId, targetMessageResults);
        if (!targetMessageResults || targetMessageResults.length === 0) {
            throw new Error('انتظر وحاول بعد لحظات');
        }

        const targetMessage = {
            id: targetMessageResults[0].payload.message_id,
            sender_id: targetMessageResults[0].payload.sender_id,
            sender_name: targetMessageResults[0].payload.sender_name,
            message_text: targetMessageResults[0].payload.message_text,
            createdAt: targetMessageResults[0].payload.createdAt
        };

        // Validate that the message is not from the same sender
        if (targetMessage.sender_id === senderId) {
            console.log(`⚠️  User ${senderId} tried to reply to their own message ${messageId}`);
            throw new Error('لا يمكنك الرد على رسالتك الخاصة');
        }

        console.log(`✅ Found target message from ${targetMessage.sender_name}`);

        // 2. Fetch context in parallel
        console.log('🔄 Fetching context data...');
        const [roomData, userData] = await Promise.all([
            getRoom(roomId).catch(() => null),
            getUser(senderId).catch(() => null)
        ]);

        const roomSummary = roomData?.summary || '';
        const userPersonalization = userData?.personalization_summary || '';

        // 3. Fetch latest messages from room
        console.log('🔍 Fetching latest messages...');
        const allRoomMessages = await Qdrant.scrollAll(
            Qdrant.COLLECTIONS.MESSAGES,
            {
                must: [{
                    key: 'room_id',
                    match: { value: roomId }
                }]
            },
            15
        ).catch(() => []);

        console.log(`📊 Retrieved ${allRoomMessages.length} total room messages from Qdrant`);

        // Get latest messages (sorted by time)
        const latestMessages = allRoomMessages
            .map(p => ({
                id: p.payload.message_id,
                sender_id: p.payload.sender_id,
                sender_name: p.payload.sender_name,
                message_text: p.payload.message_text,
                createdAt: p.payload.createdAt
            }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        console.log(`📊 Latest messages: ${latestMessages.length}`);

        // 4. Build reply prompt
        console.log('📝 Building reply prompt...');
        const prompt = buildReplyPrompt({
            targetMessage,
            senderId,
            roomSummary,
            userPersonalization,
            latestMessages
        });

        // 5. System prompt for reply generation
        const systemPrompt = `أنت تقوم بالرد على رسالة محددة بدلاً من المرسل الأصلي.

**دورك:**
- قراءة الرسالة المطلوب الرد عليها
- فهم السياق من الرسائل الأخرى
- تقديم رد مناسب ومفيد كأنك المرسل نفسه

**اللغة والأسلوب:**
- 🎯 رد بنفس اللغة والأسلوب المستخدم في الرسالة الأصلية
  * إذا كانت بالعامية المصرية → رد بالعامية المصرية
  * إذا كانت بالفصحى → رد بالفصحى
  * إذا كانت بالإنجليزي → رد بالإنجليزي
- 💬 كن طبيعياً ومتناسقاً مع أسلوب المحادثة
- ✂️ كن مختصراً ومباشراً
- 🚫 لا تذكر أنك AI أو أنك ترد بدلاً من شخص

**قواعد مهمة:**
1. ركز على الرسالة المحددة فقط
2. استخدم السياق المتاح لفهم الموقف بشكل أفضل
3. قدم رداً واحداً واضحاً ومفيداً
4. كن ذكياً في اختيار الرد المناسب
5. الالتزام التام بصيغة JSON المطلوبة`;

        // 6. Generate response
        console.log('🧠 Generating AI reply...');
        const generationStart = Date.now();

        const job = await enqueueTextGeneration(
            prompt,
            systemPrompt,
            {
                maxTokens: 1000,
                temperature: 0.6
            }
        );

        const result = await job.finished();
        const provider = result.provider || result.metadata?.provider || 'unknown';
        const model = result.model || result.metadata?.model || 'unknown';
        const rawModelOutput = (result.answer || '').trim();
        const { answer, suggestedAnswer } = parseChatModelResponse(rawModelOutput);

        const generationTime = Date.now() - generationStart;
        const totalTime = Date.now() - startTime;

        console.log(`✅ Reply generated (${generationTime}ms)`);
        console.log(`📊 Parsed answer length: ${answer.length} chars`);

        // 7. Return response (no storage needed for message replies)
        return {
            success: true,
            answer,
            suggestedAnswer,
            provider,
            model,
            targetMessage: {
                id: targetMessage.id,
                sender_id: targetMessage.sender_id,
                sender_name: targetMessage.sender_name,
                message_text: targetMessage.message_text,
                createdAt: targetMessage.createdAt
            },
            context: {
                roomId,
                senderId,
                hasRoomSummary: !!roomSummary,
                hasUserPersonalization: !!userPersonalization,
                latestMessagesCount: latestMessages.length
            },
            metadata: {
                generationTime: `${generationTime}ms`,
                totalTime: `${totalTime}ms`,
                provider,
                model
            }
        };

    } catch (error) {
        console.error('❌ Error in generateMessageReply:', error);

        // Return user-friendly error message
        if (error.message === 'انتظر وحاول بعد لحظات') {
            throw error;
        }

        throw new Error('فشل في توليد الرد، حاول مرة أخرى');
    }
}

/**
 * Calculate context quality score (0-100)
 */
function calculateContextQuality(context) {
    let score = 0;

    if (context.roomSummary) score += 20;
    if (context.userPersonalization) score += 15;
    if (context.aiChatHistory.length > 0) score += 30;
    if (context.latestMessages.length > 0) score += 35;  // Increased from 15 to 35

    return Math.min(100, score);
}
