// utils/embeddingHelper.js
import { pipeline } from '@xenova/transformers';

const CONFIG = {
  embeddingModel: 'Xenova/multilingual-e5-small',
  embeddingSize: 384,
};

let embedder = null;

/**
 * Initialize the embedding model
 */
export async function initializeEmbedder() {
  if (!embedder) {
    console.log(`🔄 Loading embedding model: ${CONFIG.embeddingModel}...`);
    embedder = await pipeline('feature-extraction', CONFIG.embeddingModel);
    console.log('✅ Embedding model loaded successfully');
    console.log('ℹ️  Note: This model uses prefixes (query:/passage:) for optimal results');
  }
  return embedder;
}

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @param {string} prefix - Prefix type: 'query' or 'passage'
 * @returns {Promise<Array<number>>} - Embedding vector
 */
export async function generateEmbedding(text, prefix = 'passage') {
  if (!embedder) {
    await initializeEmbedder();
  }

  const prefixedText = `${prefix}: ${text}`;

  const output = await embedder(prefixedText, {
    pooling: 'mean',
    normalize: true
  });

  return Array.from(output.data);
}

/**
 * Generate embeddings for multiple texts (batch)
 * @param {Array<string>} texts - Texts to embed
 * @param {string} prefix - Prefix type: 'query' or 'passage'
 * @returns {Promise<Array<Array<number>>>} - Array of embedding vectors
 */
export async function generateEmbeddingsBatch(texts, prefix = 'passage') {
  if (!embedder) {
    await initializeEmbedder();
  }

  const prefixedTexts = texts.map(text => `${prefix}: ${text}`);

  const output = await embedder(prefixedTexts, {
    pooling: 'mean',
    normalize: true
  });

  const embeddings = [];
  for (let i = 0; i < texts.length; i++) {
    const start = i * CONFIG.embeddingSize;
    const end = start + CONFIG.embeddingSize;
    embeddings.push(Array.from(output.data.slice(start, end)));
  }

  return embeddings;
}

export { CONFIG };
