# AI Chat Messages Schema Update

## Overview
Updated the AI_CHAT_MESSAGES collection to include the `ai_suggested_answer` field in the payload.

## Changes Made

### 1. **aiChatMessageController.js**
Updated all functions to handle the new `ai_suggested_answer` field:

#### `storeAIChatMessage()`
- **Added parameter**: `ai_suggested_answer` (between `ai_answer` and `provider_name`)
- **Added sanitization**: `sanitizedSuggestedAnswer` with null handling
- **Updated payload**: Now stores `ai_suggested_answer` field

**Function signature:**
```javascript
export async function storeAIChatMessage(
    user_id,
    room_id,
    user_question,
    ai_answer,
    ai_suggested_answer,  // ← NEW
    provider_name,
    model_name,
    createdAt = new Date().toISOString()
)
```

#### `getLatestAIChatMessages()`
- **Updated return object**: Now includes `ai_suggested_answer: r.payload.ai_suggested_answer || null`

#### `queryAIChatMessages()`
- **Updated return object**: Now includes `ai_suggested_answer: r.payload.ai_suggested_answer || null`

### 2. **chatController.js**
Updated the `generateChatResponse()` function:

#### Storage Call
- **Updated**: Now passes `suggestedAnswer` to `storeAIChatMessage()`

**Before:**
```javascript
AIChatMessageController.storeAIChatMessage(
    userId,
    roomId,
    userQuestion,
    answer,
    provider,
    model
)
```

**After:**
```javascript
AIChatMessageController.storeAIChatMessage(
    userId,
    roomId,
    userQuestion,
    answer,
    suggestedAnswer,  // ← NEW
    provider,
    model
)
```

## Database Schema

### AI_CHAT_MESSAGES Collection Payload Structure

```javascript
{
    user_id: string,              // Indexed (keyword)
    room_id: string,              // Indexed (keyword)
    user_question: string,        // Sanitized user question
    ai_answer: string,            // Sanitized AI answer (detailed)
    ai_suggested_answer: string | null,  // ← NEW: Sanitized suggested answer (brief)
    provider_name: string,        // AI provider (e.g., "groq", "openai")
    model_name: string,           // Model name (e.g., "llama-3.3-70b-versatile")
    createdAt: string            // Indexed (datetime), ISO 8601 format
}
```

## Benefits

1. **Complete Context Storage**: Both detailed and brief answers are now stored
2. **Better UX**: Frontend can display suggested quick replies
3. **Conversation Continuity**: Full context available for future interactions
4. **Backward Compatible**: Uses `|| null` fallback for existing records without this field

## Migration Notes

- **No migration needed**: Existing records will return `null` for `ai_suggested_answer`
- **Graceful handling**: All retrieval functions use `|| null` fallback
- **Forward compatible**: New records will include the suggested answer

## Testing

To test the changes:

1. Send a chat request to `/api/v1/chat`
2. Check the response includes both `answer` and `suggestedAnswer`
3. Query chat history: `/api/v1/chat/history?userId=X&roomId=Y`
4. Verify the returned records include `ai_suggested_answer` field

## Example Response

```json
{
    "success": true,
    "answer": "Detailed answer here...",
    "suggestedAnswer": "Brief reply here",
    "provider": "groq",
    "model": "llama-3.3-70b-versatile",
    "context": { ... },
    "metadata": { ... }
}
```

## Example History Record

```json
{
    "id": "uuid-here",
    "user_id": "user123",
    "room_id": "room456",
    "user_question": "تاني",
    "ai_answer": "Detailed Arabic answer...",
    "ai_suggested_answer": "Brief Arabic reply",
    "provider_name": "groq",
    "model_name": "llama-3.3-70b-versatile",
    "createdAt": "2025-11-23T22:00:00.000Z"
}
```
