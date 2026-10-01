// HTTP layer only: AI logic lives in geminiService, semantic search in searchIndex.

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const config = require("./config");
const geminiService = require("./geminiService");
const searchIndex = require("./searchIndex");
const sapClient = require("./sapClient");

const app = express();

app.use(cors({
  origin: function (origin, callback) {
    // No origin means same-origin or a tool like curl/Postman
    if (!origin || config.ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("CORS: bu origin'e izin yok -> " + origin));
    }
  }
}));

app.use(express.json({ limit: "20mb" }));  // base64 PDFs can be large

// Document or free-text analysis
app.post("/analyze", async (req, res) => {
  try {
    const result = await geminiService.analyze({
      documentText: req.body && req.body.documentText,
      pdfBase64:    req.body && req.body.pdfBase64,
      mimeType:     req.body && req.body.mimeType
    });
    // Model name is stored in ZITSM_AISUG for traceability
    return res.json({ ok: true, data: result, model: config.MODEL });

  } catch (err) {
    if (err instanceof geminiService.AnalyzeError) {
      const body = { ok: false, error: err.message, code: err.code };
      if (err.details) body.details = err.details;
      return res.status(err.statusCode).json(body);
    }
    console.error("Unexpected error:", err.message, err.stack);
    return res.status(500).json({
      ok: false,
      error: "Beklenmeyen bir hata oluştu. Lütfen daha sonra deneyin.",
      code: "INTERNAL_ERROR"
    });
  }
});

// Context-aware chat assistant (FR-01). Body: { history: [{ sender: "U"|"A", text }] }
app.post("/chat", async (req, res) => {
  try {
    const result = await geminiService.chat({
      history: req.body && req.body.history
    });
    return res.json({ ok: true, data: result });

  } catch (err) {
    if (err instanceof geminiService.AnalyzeError) {
      const body = { ok: false, error: err.message, code: err.code };
      if (err.details) body.details = err.details;
      return res.status(err.statusCode).json(body);
    }
    console.error("Chat error:", err.message, err.stack);
    return res.status(500).json({
      ok: false,
      error: "Sohbet cevabı üretilemedi. Lütfen daha sonra deneyin.",
      code: "CHAT_ERROR"
    });
  }
});

// Incident summary for the support engineer (FR-08)
app.post("/summary", async (req, res) => {
  try {
    const result = await geminiService.summarizeIncident({
      title:       req.body && req.body.title,
      description: req.body && req.body.description
    });
    return res.json({ ok: true, data: result });

  } catch (err) {
    if (err instanceof geminiService.AnalyzeError) {
      const body = { ok: false, error: err.message, code: err.code };
      if (err.details) body.details = err.details;
      return res.status(err.statusCode).json(body);
    }
    console.error("Summary error:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Özet oluşturulamadı.",
      code: "SUMMARY_ERROR"
    });
  }
});

// Compares a revised document with existing requirements and tests (bonus)
app.post("/requirement-diff", async (req, res) => {
  try {
    const b = req.body || {};
    const result = await geminiService.diffRequirements({
      existingRequirements: b.existingRequirements,
      tests:        b.tests,
      documentText: b.documentText,
      pdfBase64:    b.pdfBase64,
      mimeType:     b.mimeType
    });
    return res.json({ ok: true, data: result, model: config.MODEL });

  } catch (err) {
    if (err instanceof geminiService.AnalyzeError) {
      const body = { ok: false, error: err.message, code: err.code };
      if (err.details) body.details = err.details;
      return res.status(err.statusCode).json(body);
    }
    console.error("Requirement diff error:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Revizyon analizi yapılamadı.",
      code: "REQ_DIFF_ERROR"
    });
  }
});

// Change summary for a resolved incident (bonus)
app.post("/release-note", async (req, res) => {
  try {
    const b = req.body || {};
    const result = await geminiService.draftReleaseNote({
      incidentNo:   b.incidentNo,
      title:        b.title,
      description:  b.description,
      category:     b.category,
      requestType:  b.requestType,
      resolution:   b.resolution,
      requirements: b.requirements,
      tests:        b.tests
    });
    return res.json({ ok: true, data: result, model: config.MODEL });

  } catch (err) {
    if (err instanceof geminiService.AnalyzeError) {
      const body = { ok: false, error: err.message, code: err.code };
      if (err.details) body.details = err.details;
      return res.status(err.statusCode).json(body);
    }
    console.error("Release note error:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Değişiklik özeti oluşturulamadı.",
      code: "RELEASE_NOTE_ERROR"
    });
  }
});

// Knowledge base article draft from a resolved incident (FR-10)
app.post("/kb-draft", async (req, res) => {
  try {
    const result = await geminiService.draftKnowledgeArticle({
      title:       req.body && req.body.title,
      description: req.body && req.body.description,
      resolution:  req.body && req.body.resolution,
      testNotes:   req.body && req.body.testNotes
    });
    return res.json({ ok: true, data: result });

  } catch (err) {
    if (err instanceof geminiService.AnalyzeError) {
      const body = { ok: false, error: err.message, code: err.code };
      if (err.details) body.details = err.details;
      return res.status(err.statusCode).json(body);
    }
    console.error("KB draft error:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Makale taslağı oluşturulamadı.",
      code: "KB_DRAFT_ERROR"
    });
  }
});

// Rebuilds the index. Body: { items: [{ id, kind: "incident"|"kb", title, text, meta }] }
app.post("/reindex", async (req, res) => {
  try {
    const items = (req.body && req.body.items) || [];

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        ok: false, error: "İndekslenecek kayıt gönderilmedi.", code: "EMPTY_ITEMS"
      });
    }

    console.log(`Rebuilding index: ${items.length} items...`);
    const result = await searchIndex.rebuild(items);
    console.log(`Index ready: ${result.indexed} indexed, ${result.failed} failed.`);

    return res.json({ ok: true, data: result });

  } catch (err) {
    console.error("Reindex error:", err.message);
    return res.status(500).json({
      ok: false, error: "İndeks oluşturulamadı.", code: "REINDEX_ERROR"
    });
  }
});

// Adds or updates a single index entry
app.post("/index-item", async (req, res) => {
  try {
    const item = req.body || {};

    if (!item.id || !item.kind || !item.text) {
      return res.status(400).json({
        ok: false, error: "id, kind ve text zorunludur.", code: "INVALID_ITEM"
      });
    }

    await searchIndex.upsert(item);
    return res.json({ ok: true, data: searchIndex.stats() });

  } catch (err) {
    console.error("Index-item error:", err.message);
    return res.status(500).json({
      ok: false, error: "Kayıt indekslenemedi.", code: "INDEX_ITEM_ERROR"
    });
  }
});

// Removes an entry deleted in SAP
app.post("/index-remove", (req, res) => {
  try {
    const b = req.body || {};
    if (!b.id || !b.kind) {
      return res.status(400).json({
        ok: false, error: "id ve kind zorunludur.", code: "INVALID_ITEM"
      });
    }
    const removed = searchIndex.remove(b.id, b.kind);
    return res.json({ ok: true, data: { removed: removed, stats: searchIndex.stats() } });

  } catch (err) {
    console.error("Index-remove error:", err.message);
    return res.status(500).json({
      ok: false, error: "Kayıt indeksten çıkarılamadı.", code: "INDEX_REMOVE_ERROR"
    });
  }
});

// Semantic similarity search. Body: { text, kind?, topK?, minScore?, excludeId? }
app.post("/similar", async (req, res) => {
  try {
    const text = (req.body && req.body.text) || "";

    if (!text.trim()) {
      return res.status(400).json({
        ok: false, error: "Arama metni boş olamaz.", code: "EMPTY_QUERY"
      });
    }

    const results = await searchIndex.search(text, {
      kind:      req.body.kind,
      topK:      req.body.topK,
      minScore:  req.body.minScore,
      excludeId: req.body.excludeId
    });

    return res.json({ ok: true, data: { results: results, stats: searchIndex.stats() } });

  } catch (err) {
    console.error("Similar error:", err.message);
    return res.status(500).json({
      ok: false, error: "Benzerlik araması yapılamadı.", code: "SIMILAR_ERROR"
    });
  }
});

// Returns YYYYMMDD (same as SAP DATS) so dates compare as strings
function ymdDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return "" + d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
}

// Recurring problem check (FR-09): counts only similar incidents opened in the last N days
app.post("/recurring", async (req, res) => {
  try {
    const text = (req.body && req.body.text) || "";

    if (!text.trim()) {
      return res.status(400).json({
        ok: false, error: "Kontrol metni boş olamaz.", code: "EMPTY_QUERY"
      });
    }

    const windowDays = Number(req.body.windowDays) > 0
      ? Number(req.body.windowDays)
      : (config.RECURRING_WINDOW_DAYS || 7);
    const sinceYmd = ymdDaysAgo(windowDays);

    // Stricter threshold than regular similarity
    const similar = await searchIndex.search(text, {
      kind: "incident",
      topK: 20,
      minScore: config.RECURRING_MIN_SCORE,
      excludeId: req.body.excludeId
    });

    // Entries without a creation date are skipped since recency can't be proven
    const matches = similar.filter(m =>
      m.meta && m.meta.createdOn && m.meta.createdOn >= sinceYmd
    );

    const isRecurring = matches.length >= config.RECURRING_THRESHOLD;

    const openMatches = matches.filter(m =>
      m.meta && (m.meta.status === "O" || m.meta.status === "I")
    );

    return res.json({
      ok: true,
      data: {
        isRecurring: isRecurring,
        count: matches.length,
        openCount: openMatches.length,
        threshold: config.RECURRING_THRESHOLD,
        windowDays: windowDays,
        matches: matches.map(m => ({
          id: m.id,
          title: m.title,
          status: (m.meta && m.meta.status) || "",
          priority: (m.meta && m.meta.priority) || "",
          createdOn: (m.meta && m.meta.createdOn) || "",
          score: m.score
        })),
        // Many open matches suggest a major incident, otherwise a problem record
        recommendation: !isRecurring ? null
          : (openMatches.length >= config.RECURRING_THRESHOLD
              ? "MAJOR_INCIDENT"
              : "PROBLEM")
      }
    });

  } catch (err) {
    console.error("Recurring error:", err.message);
    return res.status(500).json({
      ok: false, error: "Tekrarlayan problem kontrolü yapılamadı.", code: "RECURRING_ERROR"
    });
  }
});

app.get("/health", async (req, res) => {
  const cat = await sapClient.getCategoryConfig();
  res.json({
    ok: true,
    model: config.MODEL,
    index: searchIndex.stats(),
    categories: { source: cat.source, count: cat.categories.length },
    timestamp: new Date().toISOString()
  });
});

app.listen(config.PORT, () => {
  console.log(`AI service running: http://localhost:${config.PORT}`);
  console.log(`Model: ${config.MODEL}`);
  console.log(`Embedding model: ${config.EMBEDDING_MODEL} (${config.EMBEDDING_DIM} dims)`);
  console.log(`Allowed expertise: ${config.ALLOWED_EXPERTISE.join(", ")}`);
  console.log(`Allowed origins: ${config.ALLOWED_ORIGINS.join(", ")}`);
});
