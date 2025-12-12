// utils/qdrantHelper.js
import { QdrantClient } from '@qdrant/js-client-rest';

let qdrantClient = null;
let isInitialized = false;

const COLLECTIONS = {
    MESSAGES: 'messages',
    ROOMS: 'rooms',
    USERS: 'users',
    AI_CHAT_MESSAGES: 'ai_chat_messages'
};

/**
 * Initialize Qdrant client and ensure collections exist
 */
export async function initializeQdrant(url, apiKey, embeddingSize = 384) {
    try {
        console.log('🔄 Initializing Qdrant client...');

        qdrantClient = new QdrantClient({
            url,
            apiKey
        });

        // Test connection
        await qdrantClient.getCollections();
        console.log('✅ Connected to Qdrant Cloud');

        // Ensure collections exist
        await ensureCollection(COLLECTIONS.MESSAGES, embeddingSize);
        await ensureCollection(COLLECTIONS.ROOMS, embeddingSize);
        await ensureCollection(COLLECTIONS.USERS, embeddingSize);
        await ensureCollection(COLLECTIONS.AI_CHAT_MESSAGES, embeddingSize);

        isInitialized = true;
        console.log('✅ Qdrant collections initialized');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize Qdrant:', error);
        throw error;
    }
}

/**
 * Ensure a collection exists, create if it doesn't
 */
async function ensureCollection(collectionName, vectorSize) {
    try {
        // Try to get the collection - more reliable than collectionExists()
        await qdrantClient.getCollection(collectionName);
        console.log(`✅ Collection exists: ${collectionName}`);
    } catch (error) {
        // Collection doesn't exist, create it
        if (error.status === 404 || error.message?.includes('Not found')) {
            console.log(`🔄 Creating collection: ${collectionName}`);

            await qdrantClient.createCollection(collectionName, {
                vectors: {
                    size: vectorSize,
                    distance: 'Cosine'
                }
            });

            // Create payload indexes for better performance
            if (collectionName === COLLECTIONS.MESSAGES) {
                await qdrantClient.createPayloadIndex(collectionName, {
                    field_name: 'message_id',
                    field_schema: 'keyword'
                });
                await qdrantClient.createPayloadIndex(collectionName, {
                    field_name: 'room_id',
                    field_schema: 'keyword'
                });
                await qdrantClient.createPayloadIndex(collectionName, {
                    field_name: 'sender_id',
                    field_schema: 'keyword'
                });
                await qdrantClient.createPayloadIndex(collectionName, {
                    field_name: 'createdAt',
                    field_schema: 'datetime'
                });
            } else if (collectionName === COLLECTIONS.ROOMS) {
                await qdrantClient.createPayloadIndex(collectionName, {
                    field_name: 'room_id',
                    field_schema: 'keyword'
                });
            } else if (collectionName === COLLECTIONS.USERS) {
                await qdrantClient.createPayloadIndex(collectionName, {
                    field_name: 'user_id',
                    field_schema: 'keyword'
                });
            } else if (collectionName === COLLECTIONS.AI_CHAT_MESSAGES) {
                await qdrantClient.createPayloadIndex(collectionName, {
                    field_name: 'user_id',
                    field_schema: 'keyword'
                });
                await qdrantClient.createPayloadIndex(collectionName, {
                    field_name: 'room_id',
                    field_schema: 'keyword'
                });
                await qdrantClient.createPayloadIndex(collectionName, {
                    field_name: 'createdAt',
                    field_schema: 'datetime'
                });
            }

            console.log(`✅ Created collection: ${collectionName}`);
        } else {
            // Some other error occurred
            console.error(`❌ Error checking collection ${collectionName}:`, error);
            throw error;
        }
    }
}

/**
 * Get Qdrant client instance
 */
export function getClient() {
    if (!qdrantClient || !isInitialized) {
        throw new Error('Qdrant client not initialized. Call initializeQdrant first.');
    }
    return qdrantClient;
}

/**
 * Check if Qdrant is initialized
 */
export function isReady() {
    return isInitialized;
}

// ==================== Generic Operations ====================

/**
 * Upsert points to a collection
 */
export async function upsert(collectionName, points) {
    const client = getClient();
    await client.upsert(collectionName, {
        points: Array.isArray(points) ? points : [points]
    });
}

/**
 * Search in a collection
 */
export async function search(collectionName, vector, limit = 10, filter = null) {
    const client = getClient();

    const searchParams = {
        vector,
        limit,
        with_payload: true,
        with_vector: false
    };

    if (filter) {
        searchParams.filter = filter;
    }

    return await client.search(collectionName, searchParams);
}

/**
 * Retrieve points by IDs
 */
export async function retrieve(collectionName, ids) {
    const client = getClient();
    const results = await client.retrieve(collectionName, {
        ids: Array.isArray(ids) ? ids : [ids],
        with_payload: true,
        with_vector: false
    });
    return results;
}

/**
 * Delete points by IDs
 */
export async function deletePoints(collectionName, ids) {
    const client = getClient();
    await client.delete(collectionName, {
        points: Array.isArray(ids) ? ids : [ids]
    });
}

/**
 * Delete points by filter
 */
export async function deleteByFilter(collectionName, filter) {
    const client = getClient();
    await client.delete(collectionName, {
        filter
    });
}

/**
 * Scroll through all points in a collection (with optional filter)
 */
export async function scrollAll(collectionName, filter = null, limit = 100) {
    const client = getClient();
    const allPoints = [];
    let offset = null;

    do {
        const result = await client.scroll(collectionName, {
            filter,
            limit,
            offset,
            with_payload: true,
            with_vector: false
        });

        allPoints.push(...result.points);
        offset = result.next_page_offset;
    } while (offset);

    return allPoints;
}

/**
 * Get collection info (including count)
 */
export async function getCollectionInfo(collectionName) {
    const client = getClient();
    return await client.getCollection(collectionName);
}

/**
 * Count points in collection (with optional filter)
 */
export async function count(collectionName, filter = null) {
    const client = getClient();
    const result = await client.count(collectionName, {
        filter,
        exact: true
    });
    return result.count;
}

export { COLLECTIONS };
