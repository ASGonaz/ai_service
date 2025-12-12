// utils/lancedbHelper.js
import lancedb from "vectordb";
import fs from "fs";

let db = null;
let messagesTable = null;
let isInitialized = false;

const TABLES = {
    MESSAGES: 'messages'
};

/**
 * Initialize LanceDB connection and ensure tables exist
 */
export async function initializeLanceDB(dbPath, embeddingSize = 384) {
    try {
        console.log('🔄 Initializing LanceDB...');

        // Create data directory if needed
        if (!fs.existsSync(dbPath)) {
            fs.mkdirSync(dbPath, { recursive: true });
            console.log(`✅ Created data directory: ${dbPath}`);
        }

        // Connect to LanceDB
        db = await lancedb.connect(dbPath);
        console.log('✅ LanceDB connected');

        // Ensure messages table exists
        messagesTable = await ensureMessagesTable(embeddingSize);

        isInitialized = true;
        console.log('✅ LanceDB tables initialized');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize LanceDB:', error);
        throw error;
    }
}

/**
 * Ensure messages table exists, create if it doesn't
 */
async function ensureMessagesTable(embeddingSize) {
    try {
        const table = await db.openTable(TABLES.MESSAGES);
        console.log(`✅ LanceDB table '${TABLES.MESSAGES}' opened`);
        return table;
    } catch (error) {
        console.log(`🔄 Creating new LanceDB table '${TABLES.MESSAGES}'...`);
        const dummyVector = new Array(embeddingSize).fill(0);
        const table = await db.createTable(TABLES.MESSAGES, [
            {
                id: '__init__',
                vector: dummyVector,
                room_id: '__init__',
                sender_id: '__init__',
                sender_name: '__init__',
                message_text: '',
                createdAt: new Date().toISOString()
            }
        ]);
        console.log(`✅ LanceDB table '${TABLES.MESSAGES}' created with message_text field`);
        return table;
    }
}

/**
 * Get LanceDB database instance
 */
export function getDB() {
    if (!db || !isInitialized) {
        throw new Error('LanceDB not initialized. Call initializeLanceDB first.');
    }
    return db;
}

/**
 * Get messages table instance
 */
export function getMessagesTable() {
    if (!messagesTable || !isInitialized) {
        throw new Error('LanceDB not initialized. Call initializeLanceDB first.');
    }
    return messagesTable;
}

/**
 * Check if LanceDB is initialized
 */
export function isReady() {
    return isInitialized;
}

// ==================== Messages Operations ====================

/**
 * Add message to LanceDB
 */
export async function addMessage(id, vector, room_id, sender_id, sender_name, message_text, createdAt) {
    const table = getMessagesTable();
    await table.add([{
        id,
        vector,
        room_id,
        sender_id,
        sender_name,
        message_text,
        createdAt
    }]);
}

/**
 * Add multiple messages to LanceDB
 */
export async function addMessages(messages) {
    const table = getMessagesTable();
    await table.add(messages);
}

/**
 * Search messages in LanceDB
 */
export async function searchMessages(queryVector, limit = 10, roomFilter = null, minScore = 0) {
    const table = getMessagesTable();

    const rawResults = await table
        .search(queryVector)
        .limit(limit + 1)
        .execute();

    let results = rawResults
        .filter(r => r.id !== '__init__')
        .map(r => {
            const score = 1 / (1 + r._distance);
            return {
                id: r.id,
                score: parseFloat(score.toFixed(4)),
                distance: parseFloat(r._distance.toFixed(4)),
                room_id: r.room_id,
                sender_id: r.sender_id,
                sender_name: r.sender_name,
                message_text: r.message_text,
                createdAt: r.createdAt,
                source: 'lancedb'
            };
        })
        .filter(r => r.score >= minScore);

    if (roomFilter) {
        results = results.filter(r => r.room_id === roomFilter);
    }

    return results.slice(0, limit);
}

/**
 * Delete message from LanceDB
 */
export async function deleteMessage(id) {
    const table = getMessagesTable();
    await table.delete(`id = '${id}'`);
}

/**
 * Delete all messages in a room from LanceDB
 */
export async function deleteRoomMessages(roomId, embeddingSize = 384) {
    const table = getMessagesTable();

    // Search for all messages in the room
    const allResults = await table
        .search(new Array(embeddingSize).fill(0))
        .limit(20000)
        .execute();

    const roomMessages = allResults.filter(r => {
        return r.room_id === roomId && r.id !== '__init__';
    });

    for (const msg of roomMessages) {
        try {
            await table.delete(`id = '${msg.id}'`);
        } catch (error) {
            console.error(`Failed to delete message ${msg.id} from LanceDB:`, error.message);
        }
    }

    return roomMessages.length;
}

/**
 * Count total messages in LanceDB (excluding init message)
 */
export async function countMessages() {
    const table = getMessagesTable();
    const totalCount = await table.countRows();
    return Math.max(0, totalCount - 1); // Exclude __init__ message
}

/**
 * Get all messages (with optional filter)
 */
export async function getAllMessages(roomFilter = null, embeddingSize = 384) {
    const table = getMessagesTable();

    const allResults = await table
        .search(new Array(embeddingSize).fill(0))
        .limit(20000)
        .execute();

    let results = allResults.filter(r => r.id !== '__init__');

    if (roomFilter) {
        results = results.filter(r => r.room_id === roomFilter);
    }

    return results;
}

export { TABLES };
