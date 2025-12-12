// utils/aiProvidersDirect.js
// Direct AI provider calls (used by workers)
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { initializeDeepgram, transcribeAudioDeepgram as deepgramTranscribe } from "./deepgram.js";
import { initializeAssemblyAI, transcribeAudioAssemblyAI as assemblyAITranscribe } from "./assemblyAi.js";

let groq = null;
let gemini = null;
let deepgram = null;
let assemblyai = null;

/**
 * Initialize AI providers
 */
export function initializeProviders(groqApiKey, geminiApiKey, deepgramApiKey, assemblyAIApiKey) {
  if (groqApiKey) {
    groq = new Groq({ apiKey: groqApiKey });
    console.log("✅ Groq provider initialized");
  } else {
    console.warn("⚠️ GROQ_API_KEY not set");
  }

  if (geminiApiKey) {
    gemini = new GoogleGenerativeAI(geminiApiKey);
    console.log("✅ Gemini provider initialized");
  } else {
    console.warn("⚠️ GEMINI_API_KEY not set");
  }

  if (deepgramApiKey) {
    deepgram = initializeDeepgram(deepgramApiKey);
    console.log("✅ Deepgram provider initialized (audio fallback #1)");
  } else {
    console.warn("⚠️ DEEPGRAM_API_KEY not set - audio fallback #1 unavailable");
  }

  if (assemblyAIApiKey) {
    assemblyai = initializeAssemblyAI(assemblyAIApiKey);
    console.log("✅ AssemblyAI provider initialized (audio fallback #2)");
  } else {
    console.warn("⚠️ ASSEMBLYAI_API_KEY not set - audio fallback #2 unavailable");
  }
}

/**
 * Transcribe audio using Groq Whisper
 */
export async function transcribeAudioGroq(audioUrl, language = "ar") {
  if (!groq) throw new Error("Groq not initialized");

  console.log("🎤 Transcribing with Groq Whisper...");

  const resp = await fetch(audioUrl, { redirect: "follow" });
  if (!resp.ok) throw new Error(`fetch failed with ${resp.status}`);

  const ct = resp.headers.get("content-type") || "application/octet-stream";
  const urlBasename = (() => {
    try { return new URL(audioUrl).pathname.split("/").pop() || "audio"; }
    catch { return "audio"; }
  })();
  const baseName = urlBasename.split("?")[0] || "audio";
  const blob = await resp.blob();
  const file = new File([blob], baseName, { type: ct });

  const result = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    language: language,
  });

  return {
    text: result.text,
    language: result?.language ?? null,
    provider: "groq",
    model: "whisper-large-v3-turbo"
  };
}

/**
 * Transcribe audio using Deepgram
 */
export async function transcribeAudioDeepgram(audioUrl, language = "ar") {
  if (!deepgram) throw new Error("Deepgram not initialized");

  return await deepgramTranscribe(audioUrl, language);
}

/**
 * Transcribe audio using AssemblyAI
 */
export async function transcribeAudioAssemblyAI(audioUrl, language = "ar") {
  if (!assemblyai) throw new Error("AssemblyAI not initialized");

  return await assemblyAITranscribe(audioUrl, language);
}

/**
 * Describe image using Groq Vision
 */
export async function describeImageGroq(imageUrl, prompt = "صف الصورة بشكل دقيق وبالعربية.") {
  if (!groq) throw new Error("Groq not initialized");

  console.log("🖼️ Describing image with Groq Vision...");

  // Convert image to base64 to support localhost URLs
  const base64Image = await urlToBase64(imageUrl);
  const dataUrl = `data:image/jpeg;base64,${base64Image}`;

  const completion = await groq.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: dataUrl }
          }
        ]
      }
    ],
    max_completion_tokens: 700,
    temperature: 0.2,
  });

  const description = completion?.choices?.[0]?.message?.content || "(لا يوجد نص).";

  return {
    description,
    provider: "groq",
    model: "meta-llama/llama-4-scout-17b-16e-instruct"
  };
}

/**
 * Describe image using Gemini Vision
 */
export async function describeImageGemini(imageUrl, prompt = "صف الصورة بشكل دقيق وبالعربية.") {
  if (!gemini) throw new Error("Gemini not initialized");

  console.log("🖼️ Describing image with Gemini Vision...");

  const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: await urlToBase64(imageUrl)
      }
    },
    { text: prompt }
  ]);

  const description = result.response.text();

  return {
    description,
    provider: "gemini",
    model: "gemini-1.5-flash"
  };
}

/**
 * Extract text (OCR) from image using Groq Vision - ✨ NEW
 */
export async function extractTextGroq(imageUrl, languages = ["ar", "en"]) {
  if (!groq) throw new Error("Groq not initialized");

  console.log("📝 Extracting text with Groq Vision OCR...");

  const langPrompt = languages.includes("ar") && languages.includes("en")
    ? "Extract ALL text from this image in Arabic and English. Return ONLY the extracted text, preserving the original language and formatting. If there's no text, return 'NO_TEXT'."
    : languages.includes("ar")
      ? "Extract ALL Arabic text from this image. Return ONLY the extracted text. If there's no text, return 'NO_TEXT'."
      : "Extract ALL English text from this image. Return ONLY the extracted text. If there's no text, return 'NO_TEXT'.";

  // Convert image to base64 to support localhost URLs
  const base64Image = await urlToBase64(imageUrl);
  const dataUrl = `data:image/jpeg;base64,${base64Image}`;

  const completion = await groq.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: langPrompt },
          {
            type: "image_url",
            image_url: { url: dataUrl }
          }
        ]
      }
    ],
    max_completion_tokens: 1000,
    temperature: 0.1, // Low temperature for accurate OCR
  });

  const extractedText = completion?.choices?.[0]?.message?.content || "NO_TEXT";
  const hasText = extractedText !== "NO_TEXT" && extractedText.trim().length > 0;

  return {
    text: hasText ? extractedText.trim() : "",
    hasText,
    languages,
    provider: "groq",
    model: "meta-llama/llama-4-scout-17b-16e-instruct"
  };
}

/**
 * Extract text (OCR) from image using Gemini Vision - ✨ NEW
 */
export async function extractTextGemini(imageUrl, languages = ["ar", "en"]) {
  if (!gemini) throw new Error("Gemini not initialized");

  console.log("📝 Extracting text with Gemini Vision OCR...");

  const langPrompt = languages.includes("ar") && languages.includes("en")
    ? "Extract ALL text from this image in Arabic and English. Return ONLY the extracted text, preserving the original language and formatting. If there's no text, return 'NO_TEXT'."
    : languages.includes("ar")
      ? "Extract ALL Arabic text from this image. Return ONLY the extracted text. If there's no text, return 'NO_TEXT'."
      : "Extract ALL English text from this image. Return ONLY the extracted text. If there's no text, return 'NO_TEXT'.";

  const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: await urlToBase64(imageUrl)
      }
    },
    { text: langPrompt }
  ]);

  const extractedText = result.response.text();
  const hasText = extractedText !== "NO_TEXT" && extractedText.trim().length > 0;

  return {
    text: hasText ? extractedText.trim() : "",
    hasText,
    languages,
    provider: "gemini",
    model: "gemini-1.5-flash"
  };
}

/**
 * Generate text using Groq LLM
 */
export async function generateTextGroq(prompt, systemPrompt = "", options = {}) {
  if (!groq) throw new Error("Groq not initialized");

  const { maxTokens = 500, temperature = 0.7 } = options;

  console.log("🤖 Generating text with Groq LLM...");

  const messages = systemPrompt
    ? [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ]
    : [{ role: "user", content: prompt }];

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    max_tokens: maxTokens,
    temperature: temperature,
  });

  const answer = completion.choices[0]?.message?.content || "";

  return {
    answer: answer.trim(),
    provider: "groq",
    model: "llama-3.3-70b-versatile"
  };
}

/**
 * Generate text using Gemini LLM
 */
export async function generateTextGemini(prompt, systemPrompt = "", options = {}) {
  if (!gemini) throw new Error("Gemini not initialized");

  const { maxTokens = 500, temperature = 0.7 } = options;

  console.log("🤖 Generating text with Gemini LLM...");

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  const model = gemini.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: temperature,
    }
  });

  const result = await model.generateContent(fullPrompt);
  const answer = result.response.text();

  return {
    answer: answer.trim(),
    provider: "gemini",
    model: "gemini-2.5-flash-lite"
  };
}

/**
 * Helper: Convert URL to base64
 */
async function urlToBase64(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

export { groq, gemini, deepgram, assemblyai };
