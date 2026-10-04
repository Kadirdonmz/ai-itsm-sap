// Vector index for semantic search, persisted to disk.
// It is a derived copy of SAP data and can be rebuilt any time via /reindex.

const fs = require("fs");
const path = require("path");
const config = require("./config");
const embeddingService = require("./embeddingService");

// Entries: { id, kind, title, text, vector, meta }
let index = [];
let loaded = false;

function indexPath() {
  return path.resolve(__dirname, config.INDEX_FILE);
}

function ensureDir() {
  const dir = path.dirname(indexPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function save() {
  try {
    ensureDir();
    fs.writeFileSync(indexPath(), JSON.stringify({
      model: config.EMBEDDING_MODEL,
      dim: config.EMBEDDING_DIM,
      updatedAt: new Date().toISOString(),
      entries: index
    }));
  } catch (err) {
    console.error("Could not write index to disk:", err.message);
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(indexPath())) {
      console.log("No index file found, starting empty.");
      index = [];
      return;
    }
    const raw = JSON.parse(fs.readFileSync(indexPath(), "utf8"));

    // Vectors from a different model or dimension are not comparable
    if (raw.model !== config.EMBEDDING_MODEL || raw.dim !== config.EMBEDDING_DIM) {
      console.warn("Index was built with a different model/dimension; resetting. Run /reindex.");
      index = [];
      return;
    }

    index = Array.isArray(raw.entries) ? raw.entries : [];
    console.log(`Index loaded: ${index.length} entries.`);
  } catch (err) {
    console.error("Could not read index, starting empty:", err.message);
    index = [];
  }
}

/**
 * Adds or replaces a single entry.
 * @param {object} item { id, kind: "incident" | "kb", title, text, meta }
 */
async function upsert(item) {
  load();

  const vector = await embeddingService.embed(item.text, "RETRIEVAL_DOCUMENT");

  const entry = {
    id: item.id,
    kind: item.kind,
    title: item.title || "",
    text: (item.text || "").substring(0, 1000),  // shortened copy for display
    meta: item.meta || {},
    vector: vector
  };

  const i = index.findIndex(e => e.id === item.id && e.kind === item.kind);
  if (i >= 0) {
    index[i] = entry;
  } else {
    index.push(entry);
  }

  save();
  return entry;
}

/**
 * Removes an entry so records deleted in SAP no longer appear in search.
 * @returns {boolean} true if an entry was removed
 */
function remove(id, kind) {
  load();
  const before = index.length;
  index = index.filter(e => !(e.id === id && e.kind === kind));
  const removed = index.length < before;
  if (removed) {
    save();
  }
  return removed;
}

/**
 * Rebuilds the whole index from the given items.
 * @returns {Promise<{indexed:number, failed:number}>}
 */
async function rebuild(items) {
  load();

  const newIndex = [];
  let failed = 0;

  for (const item of items) {
    try {
      const vector = await embeddingService.embed(item.text, "RETRIEVAL_DOCUMENT");
      newIndex.push({
        id: item.id,
        kind: item.kind,
        title: item.title || "",
        text: (item.text || "").substring(0, 1000),
        meta: item.meta || {},
        vector: vector
      });
    } catch (err) {
      console.error(`Indexing failed (${item.kind}/${item.id}):`, err.message);
      failed++;
    }
  }

  index = newIndex;
  save();
  return { indexed: index.length, failed: failed };
}

// Generic words that would make every pair look related
const STOPWORDS = new Set([
  "ile", "bir", "ben", "biz", "siz", "ama", "çok", "her", "hiç", "var", "yok", "ise", "şey",
  "gün", "kez", "the", "and", "veya", "evet", "ayn", "aynı", "diğer", "tüm", "bazı",
  "böyle", "şöyle", "öyle", "sadece", "hemen", "artık", "bile", "bugün", "akşam",
  "için", "olan", "olarak", "ancak", "fakat", "sonra", "önce", "kadar", "değil", "daha",
  "gibi", "veya", "ayrıca", "bunu", "buna", "şimdi", "zaman", "durum", "durumu", "şekilde",
  "kullanıcı", "kullanıcının", "kullanıcılar", "asistan", "özet", "sohbet", "dökümü",
  "bildirmektedir", "belirtilmiştir", "belirtmektedir", "etkilenen", "sistem", "denediği",
  "adımlar", "lütfen", "merhaba", "teşekkürler", "misiniz", "musunuz", "olabilir", "edebilir",
  "sorun", "sorunu", "sorunun", "çözüm", "çözüldü", "yapılamıyor", "alıyorum", "yaşıyor"
]);

function terms(text) {
  const map = new Map();   // stem -> first surface form as written
  (text || "")
    .split(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü_]+/)
    .forEach(word => {
      const w = word.toLocaleLowerCase("tr");
      if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) return;
      const stem = w.substring(0, 5);   // rough match for Turkish suffixes
      if (!map.has(stem)) map.set(stem, word);
    });
  return map;
}

/**
 * Words two texts share, shown as a human-readable reason for a similarity match (FR-07).
 * Deterministic and free; the score itself still comes from the embeddings.
 */
function sharedTerms(queryText, entryText, max) {
  const q = terms(queryText);
  const out = [];
  terms(entryText).forEach((word, stem) => {
    if (q.has(stem) && out.length < (max || 6)) out.push(word);
  });
  return out;
}

/**
 * Returns the entries most similar to the query text.
 * @param {object} opts { kind, topK, minScore, excludeId }
 */
async function search(queryText, opts) {
  load();
  opts = opts || {};

  if (index.length === 0) {
    return [];
  }

  const queryVector = await embeddingService.embed(queryText, "RETRIEVAL_QUERY");

  const topK     = opts.topK || config.SIMILARITY_TOP_K;
  const minScore = (opts.minScore !== undefined) ? opts.minScore : config.SIMILARITY_MIN_SCORE;

  const scored = index
    .filter(e => {
      if (opts.kind && e.kind !== opts.kind) return false;
      if (opts.excludeId && e.id === opts.excludeId) return false;
      return true;
    })
    .map(e => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      text: e.text,
      meta: e.meta,
      score: embeddingService.cosineSimilarity(queryVector, e.vector)
    }))
    .filter(e => e.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(e => Object.assign(e, { sharedTerms: sharedTerms(queryText, e.title + " " + e.text) }));

  return scored;
}

function stats() {
  load();
  const byKind = {};
  index.forEach(e => {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  });
  return {
    total: index.length,
    byKind: byKind,
    model: config.EMBEDDING_MODEL,
    dim: config.EMBEDDING_DIM
  };
}

module.exports = { upsert, remove, rebuild, search, stats, sharedTerms };
