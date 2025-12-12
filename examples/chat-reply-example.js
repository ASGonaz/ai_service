// Example usage of the /chat/reply endpoint

// Example 1: Basic usage with fetch
async function replyToMessage(roomId, senderId, messageId) {
    try {
        const response = await fetch('http://localhost:3000/api/v1/chat/reply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                roomId,
                senderId,
                messageId
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Reply generated successfully!');
            console.log('Answer:', data.answer);
            console.log('Suggested Answer:', data.suggestedAnswer);
            console.log('Target Message:', data.targetMessage.message_text);
            return data;
        } else {
            console.error('❌ Error:', data.error);
            return null;
        }
    } catch (error) {
        console.error('❌ Request failed:', error);
        return null;
    }
}

// Example 2: Usage with axios
async function replyToMessageWithAxios(roomId, senderId, messageId) {
    try {
        const response = await axios.post('http://localhost:3000/api/v1/chat/reply', {
            roomId,
            senderId,
            messageId
        });

        console.log('✅ Reply:', response.data.answer);
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            console.error('❌ Message not found - wait and try again');
        } else if (error.response?.status === 400) {
            console.error('❌ Missing required fields');
        } else {
            console.error('❌ Error:', error.message);
        }
        return null;
    }
}

// Example 3: Complete example with error handling
async function generateReplyWithErrorHandling(roomId, senderId, messageId) {
    // Validate inputs
    if (!roomId || !senderId || !messageId) {
        console.error('❌ Missing required parameters');
        return null;
    }

    console.log(`🔄 Generating reply for message ${messageId}...`);

    try {
        const response = await fetch('http://localhost:3000/api/v1/chat/reply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                roomId,
                senderId,
                messageId
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // Handle different error types
            switch (response.status) {
                case 400:
                    console.error('❌ Bad Request:', data.error);
                    break;
                case 404:
                    console.error('❌ Message not found:', data.error);
                    // Retry after a delay
                    console.log('⏳ Waiting 2 seconds before retry...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return generateReplyWithErrorHandling(roomId, senderId, messageId);
                case 500:
                    console.error('❌ Server Error:', data.error, data.details);
                    break;
                default:
                    console.error('❌ Unknown Error:', data.error);
            }
            return null;
        }

        // Success!
        console.log('✅ Reply generated successfully!');
        console.log('\n📝 Original Message:');
        console.log(`   From: ${data.targetMessage.sender_name}`);
        console.log(`   Text: ${data.targetMessage.message_text}`);
        console.log(`   Time: ${data.targetMessage.createdAt}`);

        console.log('\n💬 Generated Reply:');
        console.log(`   ${data.answer}`);

        if (data.suggestedAnswer) {
            console.log('\n💡 Suggested Alternative:');
            console.log(`   ${data.suggestedAnswer}`);
        }

        console.log('\n📊 Metadata:');
        console.log(`   Generation Time: ${data.metadata.generationTime}`);
        console.log(`   Total Time: ${data.metadata.totalTime}`);
        console.log(`   Provider: ${data.metadata.provider}`);
        console.log(`   Model: ${data.metadata.model}`);

        return data;

    } catch (error) {
        console.error('❌ Network error:', error.message);
        return null;
    }
}

// Example 4: Batch reply to multiple messages
async function replyToMultipleMessages(roomId, senderId, messageIds) {
    console.log(`🔄 Generating replies for ${messageIds.length} messages...`);

    const results = [];

    for (const messageId of messageIds) {
        console.log(`\n📝 Processing message ${messageId}...`);
        const result = await generateReplyWithErrorHandling(roomId, senderId, messageId);

        if (result) {
            results.push({
                messageId,
                success: true,
                answer: result.answer,
                suggestedAnswer: result.suggestedAnswer
            });
        } else {
            results.push({
                messageId,
                success: false,
                error: 'Failed to generate reply'
            });
        }

        // Add delay between requests to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n✅ Completed ${results.filter(r => r.success).length}/${messageIds.length} replies`);
    return results;
}

// Example usage:
// const result = await replyToMessage('room_123', 'user_456', 'msg_789');
// const result = await generateReplyWithErrorHandling('room_123', 'user_456', 'msg_789');
// const results = await replyToMultipleMessages('room_123', 'user_456', ['msg_1', 'msg_2', 'msg_3']);

module.exports = {
    replyToMessage,
    replyToMessageWithAxios,
    generateReplyWithErrorHandling,
    replyToMultipleMessages
};
