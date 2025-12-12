// utils/mediaProcessor.js
import { describeImage, extractText } from './aiProviders.js';

/**
 * Process image by getting AI description AND extracting text (OCR) - ✨ ENHANCED
 * @param {string} imageUrl - URL to image
 * @param {boolean} includeOCR - Whether to also extract text (default: true)
 * @returns {Promise<{success: boolean, description: string, extractedText: string, provider: string, error: string|null}>}
 */
export async function processImage(imageUrl, includeOCR = true) {
  console.log('🔄 Processing image:', imageUrl);
  try {
    // Get description
    const descResult = await describeImage(imageUrl);
    
    // Also extract text if requested
    let extractedText = "";
    let ocrProvider = null;
    
    if (includeOCR) {
      try {
        const ocrResult = await extractText(imageUrl, ["ar", "en"]);
        if (ocrResult.hasText) {
          extractedText = ocrResult.text;
          ocrProvider = ocrResult.provider;
        }
      } catch (ocrError) {
        console.warn("⚠️ OCR failed, continuing with description only:", ocrError.message);
      }
    }
    
    // Combine description and extracted text
    const combinedText = [descResult.description, extractedText].filter(Boolean).join(" | ");
    
    return {
      success: true,
      description: descResult.description,
      extractedText,
      combinedText,
      provider: descResult.provider,
      ocrProvider,
      model: descResult.model,
      error: null
    };
  } catch (error) {
    console.error('❌ Image processing error:', error);
    return {
      success: false,
      description: '',
      extractedText: '',
      combinedText: '',
      provider: null,
      ocrProvider: null,
      model: null,
      error: error.message
    };
  }
}

/**
 * Process audio by transcribing
 * @param {string} audioUrl - URL to audio
 * @returns {Promise<{success: boolean, transcription: string, provider: string, error: string|null}>}
 */
export async function processAudio(audioUrl) {
  console.log('🔄 Processing audio:', audioUrl);
  const { transcribeAudio } = await import('./aiProviders.js');
  
  try {
    const result = await transcribeAudio(audioUrl);
    
    return {
      success: true,
      transcription: result.text,
      language: result.language,
      provider: result.provider,
      model: result.model,
      error: null
    };
  } catch (error) {
    console.error('❌ Audio processing error:', error);
    return {
      success: false,
      transcription: '',
      language: null,
      provider: null,
      model: null,
      error: error.message
    };
  }
}

/**
 * Process document (basic text extraction)
 * @param {string} documentUrl - URL to document
 * @param {string} mimetype - MIME type
 * @returns {Promise<{success: boolean, text: string, error: string|null}>}
 */
export async function processDocument(documentUrl, mimetype) {
  try {
    if (mimetype.includes('text/plain')) {
      const response = await fetch(documentUrl);
      const text = await response.text();
      
      return {
        success: true,
        text,
        error: null
      };
    }
    
    return {
      success: false,
      text: '',
      error: 'Document processing for this format is not yet implemented. Supported: text/plain only.'
    };
  } catch (error) {
    console.error('❌ Document processing error:', error);
    return {
      success: false,
      text: '',
      error: error.message
    };
  }
}

/**
 * Process array of media files
 * @param {Array} mediaArray - Array of media objects with type, key, mimetype
 * @param {string} backendUrl - Base URL for media files
 * @param {string} token - Auth token
 * @param {string} query - Query parameter
 * @returns {Promise<Array>} - Processed media results
 */
export async function processMediaArray(mediaArray, backendUrl, token, query) {
  const results = [];
  
  for (const media of mediaArray) {
    const mediaUrl = media.key 
      ? `${backendUrl}/api/v1/media/${media.key}?token=${token}&eq=${query}`
      : null;
    
    if (!mediaUrl) {
      console.warn('⚠️ Media missing key, skipping:', media);
      continue;
    }
    
    let processedData = {
      type: media.type,
      originalName: media.originalName,
      mimetype: media.mimetype,
      extractedText: '',
      success: false,
      error: null
    };

    try {
      if (media.type === 'image') {
        const imageResult = await processImage(mediaUrl, true); // ✨ Now includes OCR
        processedData.extractedText = imageResult.combinedText; // Combined description + OCR
        processedData.description = imageResult.description;
        processedData.ocrText = imageResult.extractedText;
        processedData.success = imageResult.success;
        processedData.error = imageResult.error;
        processedData.provider = imageResult.provider;
        processedData.ocrProvider = imageResult.ocrProvider;
        processedData.model = imageResult.model;
      } else if (media.type === 'audio') {
        const audioResult = await processAudio(mediaUrl);
        processedData.extractedText = audioResult.transcription;
        processedData.success = audioResult.success;
        processedData.error = audioResult.error;
        processedData.language = audioResult.language;
        processedData.provider = audioResult.provider;
        processedData.model = audioResult.model;
      } else if (media.type === 'document') {
        const docResult = await processDocument(mediaUrl, media.mimetype);
        processedData.extractedText = docResult.text;
        processedData.success = docResult.success;
        processedData.error = docResult.error;
      }
    } catch (error) {
      processedData.error = error.message;
      console.error(`❌ Failed to process ${media.type}:`, error);
    }
    
    results.push(processedData);
  }
  
  return results;
}
