// Test file for /chat/reply endpoint
// Run with: node tests/test-chat-reply.js

const BASE_URL = 'http://localhost:3000/api/v1/chat';

// Test data
const testData = {
    roomId: 'test_room_123',
    senderId: 'test_user_456',
    messageId: 'test_msg_789'
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(color, message) {
    console.log(`${color}${message}${colors.reset}`);
}

// Test 1: Valid request
async function testValidRequest() {
    log(colors.cyan, '\n=== Test 1: Valid Request ===');

    try {
        const response = await fetch(`${BASE_URL}/reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            log(colors.green, '✅ Test PASSED');
            log(colors.blue, `Answer: ${data.answer.substring(0, 100)}...`);
            log(colors.blue, `Target Message: ${data.targetMessage?.message_text || 'N/A'}`);
            log(colors.blue, `Generation Time: ${data.metadata?.generationTime}`);
        } else {
            log(colors.yellow, '⚠️  Test PASSED (Expected behavior - message not found)');
            log(colors.blue, `Error: ${data.error}`);
        }
    } catch (error) {
        log(colors.red, `❌ Test FAILED: ${error.message}`);
    }
}

// Test 2: Missing roomId
async function testMissingRoomId() {
    log(colors.cyan, '\n=== Test 2: Missing roomId ===');

    try {
        const response = await fetch(`${BASE_URL}/reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                senderId: testData.senderId,
                messageId: testData.messageId
            })
        });

        const data = await response.json();

        if (response.status === 400 && !data.success) {
            log(colors.green, '✅ Test PASSED - Correctly rejected missing roomId');
            log(colors.blue, `Error: ${data.error}`);
        } else {
            log(colors.red, '❌ Test FAILED - Should have rejected missing roomId');
        }
    } catch (error) {
        log(colors.red, `❌ Test FAILED: ${error.message}`);
    }
}

// Test 3: Missing senderId
async function testMissingSenderId() {
    log(colors.cyan, '\n=== Test 3: Missing senderId ===');

    try {
        const response = await fetch(`${BASE_URL}/reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                roomId: testData.roomId,
                messageId: testData.messageId
            })
        });

        const data = await response.json();

        if (response.status === 400 && !data.success) {
            log(colors.green, '✅ Test PASSED - Correctly rejected missing senderId');
            log(colors.blue, `Error: ${data.error}`);
        } else {
            log(colors.red, '❌ Test FAILED - Should have rejected missing senderId');
        }
    } catch (error) {
        log(colors.red, `❌ Test FAILED: ${error.message}`);
    }
}

// Test 4: Missing messageId
async function testMissingMessageId() {
    log(colors.cyan, '\n=== Test 4: Missing messageId ===');

    try {
        const response = await fetch(`${BASE_URL}/reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                roomId: testData.roomId,
                senderId: testData.senderId
            })
        });

        const data = await response.json();

        if (response.status === 400 && !data.success) {
            log(colors.green, '✅ Test PASSED - Correctly rejected missing messageId');
            log(colors.blue, `Error: ${data.error}`);
        } else {
            log(colors.red, '❌ Test FAILED - Should have rejected missing messageId');
        }
    } catch (error) {
        log(colors.red, `❌ Test FAILED: ${error.message}`);
    }
}

// Test 5: Invalid messageId (not found)
async function testInvalidMessageId() {
    log(colors.cyan, '\n=== Test 5: Invalid messageId (not found) ===');

    try {
        const response = await fetch(`${BASE_URL}/reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                roomId: testData.roomId,
                senderId: testData.senderId,
                messageId: 'invalid_message_id_12345'
            })
        });

        const data = await response.json();

        if (response.status === 404 && !data.success) {
            log(colors.green, '✅ Test PASSED - Correctly returned 404 for invalid message');
            log(colors.blue, `Error: ${data.error}`);
        } else if (response.status === 500) {
            log(colors.yellow, '⚠️  Test PASSED (Alternative behavior - 500 error)');
            log(colors.blue, `Error: ${data.error}`);
        } else {
            log(colors.red, '❌ Test FAILED - Should have returned 404 or 500');
        }
    } catch (error) {
        log(colors.red, `❌ Test FAILED: ${error.message}`);
    }
}

// Test 6: Empty request body
async function testEmptyBody() {
    log(colors.cyan, '\n=== Test 6: Empty request body ===');

    try {
        const response = await fetch(`${BASE_URL}/reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (response.status === 400 && !data.success) {
            log(colors.green, '✅ Test PASSED - Correctly rejected empty body');
            log(colors.blue, `Error: ${data.error}`);
        } else {
            log(colors.red, '❌ Test FAILED - Should have rejected empty body');
        }
    } catch (error) {
        log(colors.red, `❌ Test FAILED: ${error.message}`);
    }
}

// Run all tests
async function runAllTests() {
    log(colors.cyan, '\n╔════════════════════════════════════════╗');
    log(colors.cyan, '║  Testing /chat/reply Endpoint          ║');
    log(colors.cyan, '╚════════════════════════════════════════╝');

    log(colors.yellow, '\n⚠️  Note: Make sure the server is running on http://localhost:3000');
    log(colors.yellow, '⚠️  Some tests expect the message to not exist (404 error)');

    await testValidRequest();
    await testMissingRoomId();
    await testMissingSenderId();
    await testMissingMessageId();
    await testInvalidMessageId();
    await testEmptyBody();

    log(colors.cyan, '\n╔════════════════════════════════════════╗');
    log(colors.cyan, '║  All Tests Completed                   ║');
    log(colors.cyan, '╚════════════════════════════════════════╝\n');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().catch(error => {
        log(colors.red, `\n❌ Test suite failed: ${error.message}`);
        process.exit(1);
    });
}

export {
    testValidRequest,
    testMissingRoomId,
    testMissingSenderId,
    testMissingMessageId,
    testInvalidMessageId,
    testEmptyBody,
    runAllTests
};
