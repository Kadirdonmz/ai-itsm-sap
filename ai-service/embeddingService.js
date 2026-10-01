// Text-to-vector conversion. Provider details stay in this file,
// so switching embedding providers only touches this module.

const config = require("./config");

const API_KEY = process.env.GEMINI_API_KEY;
const EMBED_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${config.EMBEDDING_MODEL}:embedContent?key=${API_KEY}`;

const MAX_CHARS = 8000;

/**
 * @param {string} text
 * @param {string} taskType RETRIEVAL_DOCUMENT | RETRIEVAL_QUERY | SEMANTIC_SIMILARITY
 * @returns {Promise<number[]>} normalized vector
 */
async function embed(text, taskType) {
  const cleanText = (text || "").trim().substring(0, MAX_CHARS);
  if (!cleanText) {
    throw new Error("Embedding icin bos metin verilemez.");
  }

  const body = {
    content: { parts: [{ text: cleanText }] },
    taskType: taskType || "SEMANTIC_SIMILARITY",
    outputDimensionality: config.EMBEDDING_DIM
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.EMBEDDING_TIMEOUT_MS);

  let r;
  try {
    r = await fetch(EMBED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Embedding servisi zaman asimina ugradi.");
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!r.ok) {
    const errText = await r.text();
    console.error(`Embedding error (${r.status}):`, errText.substring(0, 200));
    throw new Error(`Embedding servisi hata dondurdu (${r.status}).`);
  }

  const data = await r.json();
  const values = data && data.embedding && data.embedding.values;

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Embedding servisi bos vektor dondurdu.");
  }

  // Gemini requires normalization for dimensions other than 3072
  return normalize(values);
}

function normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
}

// Vectors are normalized, so the dot product equals cosine similarity
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

module.exports = { embed, cosineSimilarity, normalize };
