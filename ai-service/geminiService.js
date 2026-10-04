// All LLM logic: prompt building, Gemini calls and response validation.
// server.js only calls this module and knows nothing about the provider.

const config = require("./config");
const searchIndex = require("./searchIndex");
const sapClient = require("./sapClient");

const API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${config.MODEL}:generateContent?key=${API_KEY}`;

// Service-level error; routes map it to an HTTP response
class AnalyzeError extends Error {
  constructor(code, message, statusCode, details) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details || null;
  }
}

// Context-aware chat (FR-01)
async function chat({ history }) {
  var cleanHistory = Array.isArray(history)
    ? history
        .filter(function (m) {
          return m && typeof m.text === "string" && m.text.trim() &&
                 (m.sender === "U" || m.sender === "A");
        })
        .map(function (m) {
          return { sender: m.sender, text: m.text.trim() };
        })
    : [];

  if (cleanHistory.length === 0) {
    throw new AnalyzeError("EMPTY_CHAT", "Sohbet geçmişi boş.", 400);
  }

  // RAG query: everything the user has said so far
  var userText = cleanHistory
    .filter(function (m) { return m.sender === "U"; })
    .map(function (m) { return m.text; })
    .join(" ");

  var ctx = await buildKbContext(userText);
  var prompt = buildChatPrompt(cleanHistory, ctx.contextText);
  var parts = [{ text: prompt }];

  const MAX_ATTEMPTS = 2;
  let parsed = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Only invalid JSON is retried here; callGemini already retries transient errors
    const rawText = await callGemini(parts);
    try {
      parsed = JSON.parse(rawText);
      break;
    } catch (e) {
      lastError = new AnalyzeError("AI_INVALID_JSON",
        "AI'nın cevabı ayrıştırılamadı.", 502, { parseError: e.message });
      if (attempt < MAX_ATTEMPTS) continue;
    }
  }

  if (!parsed) {
    throw lastError || new AnalyzeError("AI_INVALID_JSON",
      "AI'nın cevabı ayrıştırılamadı.", 502);
  }

  var reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (!reply) {
    reply = "Üzgünüm, şu anda bir cevap üretemedim. Lütfen tekrar deneyin.";
  }

  console.log("Chat reply generated:", { messages: cleanHistory.length, kbSources: ctx.sources.length });

  // Keep only sources that were actually provided (guards against invented ids)
  var aClaimed = Array.isArray(parsed.usedSources) ? parsed.usedSources : [];
  var usedSources = ctx.sources.filter(function (s) {
    return aClaimed.indexOf(s.id) !== -1;
  });

  return { reply: reply, usedSources: usedSources };
}

function buildChatTranscript(history) {
  return history.map(function (m) {
    var etiket = m.sender === "A" ? "Asistan" : "Kullanıcı";
    return etiket + ": " + maskPII(m.text);
  }).join("\n");
}

function buildChatPrompt(history, kbContext) {
  var transcript = buildChatTranscript(history);
  return `Sen kurum içi bir ITSM (BT hizmet yönetimi) destek asistanısın. Kullanıcıyla sohbet ederek arıza veya talebini anlamaya çalışıyorsun.

Kurallar:
- Türkçe, kısa ve anlaşılır cevap ver (en fazla birkaç cümle).
- Eksik bilgi varsa NET bir soru sor (örn: hangi sistem, ne zamandır sürüyor, kaç kişiyi etkiliyor).
- Yeterli bilgi varsa ve BİLGİ BANKASI KAYITLARI veya ÇÖZÜLMÜŞ GEÇMİŞ ÇAĞRILAR sana verildiyse, ÖNCE oradaki çözümleri kullanıcıya öner (sohbet havasında, madde madde değil).
- Bilgi bankasında uygun kayıt yoksa genel ITSM bilginle mantıklı bir öneri sun, ama teknik detay uydurma.
- Çağrıyı sen açamazsın. Sorun çözülemiyorsa veya uzman gerekiyorsa kullanıcıya ekrandaki "Çağrı Oluştur" butonuna basmasını öner; "talep oluşturuyorum" gibi işlemi kendin yapıyormuş gibi ifadeler kullanma.

- SADECE geçerli bir JSON döndür: {"reply": "kullanıcıya gösterilecek cevap metni", "usedSources": ["KB-..."]}. "usedSources": cevabında GERÇEKTEN yararlandığın kayıtların id'leri (örn. "KB-0000000003" veya "INC-0000000087"); hiçbirinden yararlanmadıysan boş dizi []. JSON dışında hiçbir şey yazma.
${kbContext || ""}
Sohbet geçmişi:
"""
${transcript}
"""

Şimdi asistan olarak bir sonraki cevabı üret.`;
}

// Shared JSON rules for text and PDF analysis; catCfg comes from SAP ZITSM_CATEGORY
function buildRules(catCfg) {
  const catLines = catCfg.categories
    .map(c => `  * "${c.name}"${c.supportGroup ? " → varsayılan destek grubu: " + c.supportGroup : ""}`)
    .join("\n");

  return `Bu içeriği analiz edip SADECE geçerli bir JSON döndür. JSON dışında hiçbir şey yazma.

Kurallar:
- "requestType": talebin türü. "incident" (arıza/hata) veya "request" (yeni geliştirme/değişiklik talebi). Kararsızsan "incident".
- "title": talebi özetleyen kısa, anlaşılır bir başlık (~en fazla 80 karakter). Metin yetersizse null.
- "priority": "Low", "Medium" veya "High". SADECE "acil/kritik" kelimelerine bakma; şunları değerlendir: etkilenen kullanıcı/sistem kapsamı, iş kesintisi var mı, finansal/operasyonel etki, workaround var mı, aciliyet. Metin yetersizse null.
- "impact": iş ETKİSİ seviyesi, "Low" | "Medium" | "High". Önceliğin aksine aciliyete değil, etkinin GENİŞLİĞİNE bak: tek kullanıcı/workaround var → Low; bir ekip veya kritik olmayan süreç → Medium; birden fazla departman, üretim/satış/finans kesintisi, çok sayıda kullanıcı → High. Metin yetersizse null.
- "reason": başlık ve öncelik önerini gerekçelendiren 1-2 cümle (Türkçe).
- "summary": sorunun/talebin 2-3 cümlelik, çağrı açıklaması olarak kullanılabilecek özeti (Türkçe, üçüncü şahıs: "Kullanıcı ... bildirmektedir"). Metin yetersizse "".
- "affectedSystem": etkilenen sistem, uygulama veya işlem (örn. "Cisco AnyConnect VPN", "SAP MM – ME21N"). Metinde geçmiyorsa "" döndür, UYDURMA.
- "triedSteps": kullanıcının sorunu çözmek için ZATEN denediğini açıkça belirttiği adımlar (string dizisi). Metin bir kullanıcı–asistan sohbetiyse, asistanın ÖNERDİĞİ ama kullanıcının yaptığını söylemediği adımları EKLEME. Yoksa [].
- "suggestedSolutions": SADECE requestType "incident" ise, kullanıcının kendi deneyebileceği somut çözüm adımları (string dizisi). requestType "request" ise boş dizi [] döndür. Sana BİLGİ BANKASI KAYITLARI veya ÇÖZÜLMÜŞ GEÇMİŞ ÇAĞRILAR verildiyse ÖNCE onlardaki çözümleri kullan; kendi genel bilgini ancak bunlar yetersizse ekle.
- "usedSources": çözüm önerirken yararlandığın kayıtların id'leri (string dizisi, örn: ["KB-0000000001", "INC-0000000087"]). Hiçbirinden yararlanmadıysan [].
- "expertise": problemi çözebilecek uzmanlık alanları. SADECE şu listeden seç, UYDURMA: ${JSON.stringify(config.ALLOWED_EXPERTISE)}. Uygun yoksa [].
- "category": çağrının kategorisi ("Ana > Alt > Detay" formatında). SADECE şu listeden seç, UYDURMA (liste kurumun yönlendirme tablosundandır):
${catLines}
  Hiçbiri uymuyorsa "Diğer". İçerik yetersizse null.
- "supportGroup": çağrının yönlendirileceği TEK destek grubu. Normalde seçtiğin kategorinin varsayılan destek grubunu kullan; içerik açıkça başka bir uzmanlık gerektiriyorsa farklı seçebilirsin. SADECE şu listeden seç, UYDURMA: ${JSON.stringify(catCfg.supportGroups)}. Uygun yoksa null.
- "categoryReason": kategori ve destek grubu seçimini açıklayan 1 cümle (Türkçe). Yüzde veya güven skoru YAZMA.
- "requirements": dokümandan çıkarılan gereksinimler (dizi). Her eleman: {"id": "REQ-01", "text": "gereksinim metni", "type": "functional" | "business-rule" | "boundary" | "constraint" | "affected-area", "sourceRef": "dokümanın hangi bölümünden alındığı"}. Doküman gereksinim içermiyorsa [].
  * Tip tanımları: "functional" = sistemin yapması gereken iş. "business-rule" = iş kuralı/koşul (örn. sadece belirli belge türünde çalışma, yetkili kullanıcı muafiyeti). "boundary" = sınır koşulu, eşik değerinde veya uç durumda beklenen davranış (örn. tutar limite tam eşitken). "constraint" = teknik kısıt (örn. değerin tablodan okunması). "affected-area" = değişiklikten ETKİLENEN modül, işlem kodu, süreç veya kullanıcı grubu (örn. "SAP MM satınalma süreci; ME21N ve ME22N işlemleri").
  * Dokümanda etkilenen alanlar açıkça veya dolaylı olarak belirtiliyorsa EN AZ bir "affected-area" gereksinimi üret.
- "testSteps": gereksinimlere göre üretilecek test senaryoları (dizi). Her eleman: {"text": "test adımı (ne yapılacak)", "expectedResult": "beklenen sonuç (sistem ne yapmalı, kısa ve doğrulanabilir)", "type": "pozitif" | "negatif" | "sinir" | "yetki" | "regresyon", "isCritical": true/false, "reqId": "REQ-01"}.
  * Mümkün olduğunda her testi bir gereksinime bağla (reqId). Bağlanamıyorsa reqId "" olsun.
  * Sistemin temel işleyişini doğrulayan, başarısız olursa çözüm kabul edilemeyecek testleri isCritical: true yap.
  * Farklı test tiplerinden dengeli üret; özellikle pozitif ve negatif testleri ihmal etme.
  * Tip tanımları: "pozitif" = istenen davranışın gerçekleştiğini doğrular (örn. limit üstü siparişte uyarının çıkması). "negatif" = istenmeyen davranışın OLMADIĞINI ya da hatalı girdinin reddedildiğini doğrular (örn. limit altı siparişte gereksiz uyarının ÇIKMAMASI). "sinir" = eşik değerinin tam kendisinde davranış (örn. tutar limite tam eşit). "yetki" = farklı kullanıcı/yetki gruplarında davranış. "regresyon" = değişiklik kapsamı dışındaki mevcut işleyişin bozulmadığını doğrular.
  * İçerik yetersizse [].
- "needMoreInfo": içerik başlık/öncelik için çok belirsizse true (bu durumda title ve priority null olmalı), aksi halde false.`;
}

// Masks personal data that is not needed for analysis
function maskPII(text) {
  if (!text) return text;

  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/\bTR\d{2}[\s]?(\d{4}[\s]?){5}\d{2}\b/gi, "[IBAN]")
    .replace(/\b\d{11}\b/g, "[TCKN]")
    .replace(/\b(\d{4}[\s-]?){3}\d{4}\b/g, "[KART]")
    .replace(/(\+90|0)?[\s]?\(?\d{3}\)?[\s]?\d{3}[\s]?\d{2}[\s]?\d{2}\b/g, "[TELEFON]");
}

// RAG retrieval (FR-02): KB articles plus resolved past incidents, formatted as prompt context
async function buildKbContext(queryText) {
  const empty = { contextText: "", sources: [] };
  if (!queryText || !queryText.trim()) {
    return empty;
  }

  let hits = [];
  try {
    // One embedding call for both kinds; split afterwards
    hits = await searchIndex.search(queryText, { topK: 20, minScore: config.RAG_MIN_SCORE });
  } catch (err) {
    // Analysis should still work without context
    console.warn("Could not load RAG context:", err.message);
    return empty;
  }

  const kbHits = hits.filter(h => h.kind === "kb").slice(0, config.RAG_KB_TOP_K);

  // Only incidents with a recorded resolution, held to the stricter similarity threshold
  const incHits = hits
    .filter(h => h.kind === "incident" &&
                 h.score >= config.SIMILARITY_MIN_SCORE &&
                 h.meta && (h.meta.status === "R" || h.meta.status === "C") &&
                 (h.meta.resolution || "").trim())
    .slice(0, config.RAG_INCIDENT_TOP_K);

  if (kbHits.length === 0 && incHits.length === 0) {
    return empty;
  }

  let contextText = "";
  if (kbHits.length > 0) {
    contextText += `
BİLGİ BANKASI KAYITLARI (kurum içi çözüm arşivinden, anlam benzerliğine göre bulundu):
"""
${kbHits.map(h => `[KB-${h.id}] ${h.title}\n${maskPII(h.text)}`).join("\n\n")}
"""
`;
  }
  if (incHits.length > 0) {
    contextText += `
ÇÖZÜLMÜŞ GEÇMİŞ ÇAĞRILAR (benzer sorunların uzman tarafından girilen çözümleri):
"""
${incHits.map(h => `[INC-${h.id}] ${h.title}\nÇözüm: ${maskPII(h.meta.resolution)}`).join("\n\n")}
"""
`;
  }
  contextText += `Bu kayıtlar kurumun geçmiş çözümleridir. Çözüm önerirken ÖNCE bunlardan yararlan ve yararlandığın kaydın id'sini (KB-... veya INC-...) "usedSources" alanında belirt.
`;

  return {
    contextText: contextText,
    sources: kbHits.map(h => ({ id: "KB-" + h.id, title: h.title, score: h.score }))
      .concat(incHits.map(h => ({ id: "INC-" + h.id, title: h.title, score: h.score })))
  };
}

function buildTextPrompt(documentText, kbContext, rules) {
  const maskedText = maskPII(documentText);
  return `Sen bir ITSM (BT hizmet yönetimi) asistanısın. Sana bir kullanıcının arıza/talep dokümanının metnini vereceğim. ${rules}
${kbContext || ""}
Doküman metni:
"""
${maskedText}
"""`;
}

function buildPdfPrompt(kbContext, rules) {
  return `Sen bir ITSM (BT hizmet yönetimi) asistanısın. Sana bir kullanıcının arıza/talep dokümanını PDF olarak vereceğim. PDF içeriğini oku. ${rules}
${kbContext || ""}`;
}

// Requirement types (FR-12)
const VALID_REQ_TYPES = ["functional", "business-rule", "boundary", "constraint", "affected-area"];

function cleanResponse(parsed, aAvailableSources, catCfg) {
  const VALID_TEST_TYPES = ["pozitif", "negatif", "sinir", "yetki", "regresyon"];

  const requestType =
    parsed.requestType === "request" ? "request" : "incident";

  // Missing ids fall back to REQ-01, REQ-02, ...
  const requirements = Array.isArray(parsed.requirements)
    ? parsed.requirements
        .map((r, i) => {
          if (!r || typeof r !== "object") return null;
          const text = typeof r.text === "string" ? r.text.trim() : "";
          if (!text) return null;
          return {
            id: typeof r.id === "string" && r.id.trim()
                  ? r.id.trim()
                  : `REQ-${String(i + 1).padStart(2, "0")}`,
            text: text,
            type: VALID_REQ_TYPES.includes(r.type) ? r.type : "functional",
            sourceRef: typeof r.sourceRef === "string" ? r.sourceRef.trim() : ""
          };
        })
        .filter(r => r !== null)
    : [];

  const validReqIds = requirements.map(r => r.id);

  const testSteps = Array.isArray(parsed.testSteps)
    ? parsed.testSteps
        .map(t => {
          if (typeof t === "string") {
            const text = t.trim();
            return text ? { text, type: "pozitif", isCritical: false, reqId: "" } : null;
          }
          if (!t || typeof t !== "object") return null;
          const text = typeof t.text === "string" ? t.text.trim() : "";
          if (!text) return null;
          return {
            text: text,
            expectedResult: typeof t.expectedResult === "string" ? t.expectedResult.trim().substring(0, 255) : "",
            type: VALID_TEST_TYPES.includes(t.type) ? t.type : "pozitif",
            isCritical: t.isCritical === true,
            reqId: (typeof t.reqId === "string" && validReqIds.includes(t.reqId.trim()))
                     ? t.reqId.trim()
                     : ""
          };
        })
        .filter(t => t !== null)
    : [];

  // Only sources that were actually provided may be cited
  const availableIds = (aAvailableSources || []).map(s => s.id);
  const usedIds = Array.isArray(parsed.usedSources)
    ? parsed.usedSources
        .map(s => (typeof s === "string" ? s.trim() : ""))
        .filter(s => availableIds.includes(s))
    : [];

  const usedSources = (aAvailableSources || []).filter(s => usedIds.includes(s.id));

  // Case-insensitive match against the allowed list
  const pickFrom = (value, allowedList) => {
    if (typeof value !== "string") return null;
    const v = value.trim().toLowerCase();
    return allowedList.find(a => a.toLowerCase() === v) || null;
  };
  const category = pickFrom(parsed.category, catCfg.categories.map(c => c.name));
  const supportGroup = pickFrom(parsed.supportGroup, catCfg.supportGroups);

  const clean = {
    requestType: requestType,
    title: parsed.title != null ? String(parsed.title).trim() : null,
    priority: ["Low", "Medium", "High"].includes(parsed.priority) ? parsed.priority : null,
    impact: ["Low", "Medium", "High"].includes(parsed.impact) ? parsed.impact : null,
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
    suggestedSolutions: (requestType === "incident" && Array.isArray(parsed.suggestedSolutions))
      ? parsed.suggestedSolutions
          .map(s => typeof s === "string" ? s.trim() : "")
          .filter(s => s.length > 0)
      : [],
    expertise: Array.isArray(parsed.expertise)
      ? parsed.expertise
          .map(e => {
            if (typeof e !== "string") return null;
            const match = config.ALLOWED_EXPERTISE.find(
              allowed => allowed.toLowerCase() === e.trim().toLowerCase()
            );
            return match || null;
          })
          .filter(e => e !== null)
      : [],
    category: category,
    supportGroup: supportGroup,
    categoryReason: typeof parsed.categoryReason === "string" ? parsed.categoryReason.trim() : "",
    // FR-04: incident content extracted from chat or document
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    affectedSystem: typeof parsed.affectedSystem === "string" ? parsed.affectedSystem.trim() : "",
    triedSteps: Array.isArray(parsed.triedSteps)
      ? parsed.triedSteps
          .map(s => (typeof s === "string" ? s.trim() : ""))
          .filter(s => s.length > 0)
          .slice(0, 10)
      : [],
    requirements: requirements,
    testSteps: testSteps,
    usedSources: usedSources,
    needMoreInfo: parsed.needMoreInfo === true
  };

  if (clean.needMoreInfo) {
    clean.title = null;
    clean.priority = null;
    clean.impact = null;
    clean.category = null;
    clean.supportGroup = null;
  }

  return clean;
}

// Single Gemini request; returns the raw JSON text
async function callGeminiOnce(parts) {
  const body = {
    contents: [{ parts: parts }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.GEMINI_TIMEOUT_MS);

  let r;
  try {
    r = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    if (fetchErr.name === "AbortError") {
      throw new AnalyzeError("AI_TIMEOUT",
        "AI servisi yanıt vermedi (zaman aşımı).", 504);
    }
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  if (!r.ok) {
    const errText = await r.text();
    console.error(`Gemini error (${r.status}):`, errText.substring(0, 200));

    let sMsg = "AI servisine ulaşılamadı.";
    if (r.status === 503) {
      sMsg = "AI servisi şu anda yoğun. Lütfen birkaç saniye sonra tekrar deneyin.";
    } else if (r.status === 429) {
      sMsg = "AI kullanım kotası doldu. Lütfen daha sonra tekrar deneyin.";
    }
    throw new AnalyzeError("AI_SERVICE_ERROR", sMsg, 502, { httpStatus: r.status });
  }

  let data;
  try {
    data = await r.json();
  } catch (e) {
    throw new AnalyzeError("GEMINI_RESPONSE_INVALID",
      "AI'nın yanıtı geçerli JSON değildi.", 502);
  }

  if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
    console.error("Gemini returned no candidates:", JSON.stringify(data).substring(0, 200));
    throw new AnalyzeError("GEMINI_NO_CANDIDATES",
      "AI geçerli bir cevap üretmedi (candidates boş).", 502);
  }

  const candidate = data.candidates[0];
  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    throw new AnalyzeError("GEMINI_NO_CONTENT",
      "AI geçerli bir cevap üretmedi (content boş).", 502);
  }

  const text = candidate.content.parts[0].text || "";
  if (!text) {
    throw new AnalyzeError("GEMINI_EMPTY_TEXT", "AI'nın cevabı boş.", 502);
  }

  return text;
}

// Retries 500/503 with 1s and 2s backoff. 429 is not retried since waiting won't restore quota.
const RETRYABLE_STATUS = [500, 503];

async function callGemini(parts) {
  const MAX_TRIES = 3;
  let lastErr = null;

  for (let i = 1; i <= MAX_TRIES; i++) {
    try {
      return await callGeminiOnce(parts);
    } catch (err) {
      lastErr = err;
      const status = err.details && err.details.httpStatus;
      const retryable = RETRYABLE_STATUS.includes(status);

      if (!retryable || i === MAX_TRIES) {
        throw err;
      }

      const waitMs = 1000 * i;
      console.warn(`Gemini transient error (${status}), retrying in ${waitMs} ms (${i}/${MAX_TRIES - 1})...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  throw lastErr;
}

// Document analysis with RAG
async function analyze({ documentText, pdfBase64, mimeType }) {
  documentText = (documentText || "").trim();
  pdfBase64 = pdfBase64 || "";
  mimeType = mimeType || "";

  if (!documentText && !pdfBase64) {
    throw new AnalyzeError("EMPTY_DOC",
      "Analiz için PDF veya açıklama metni gerekli.", 400);
  }

  // Retrieval needs plain text, so it is skipped for PDF input
  let kbContext = "";
  let kbSources = [];
  if (documentText) {
    const ctx = await buildKbContext(documentText);
    kbContext = ctx.contextText;
    kbSources = ctx.sources;
    if (kbSources.length > 0) {
      console.log(`RAG context: ${kbSources.length} sources found.`);
    }
  }

  const catCfg = await sapClient.getCategoryConfig();
  const rules = buildRules(catCfg);

  let parts;
  if (pdfBase64) {
    if (mimeType && mimeType !== config.ALLOWED_MIME) {
      throw new AnalyzeError("UNSUPPORTED_FILE_TYPE",
        "Sadece PDF dosyaları desteklenmektedir.", 415, { received: mimeType });
    }
    const approxBytes = Math.floor(pdfBase64.length * 0.75);
    if (approxBytes > config.MAX_PDF_BYTES) {
      throw new AnalyzeError("FILE_TOO_LARGE",
        "PDF dosyası çok büyük (en fazla 10 MB).", 413, { approxBytes });
    }
    parts = [
      { text: buildPdfPrompt(kbContext, rules) },
      { inlineData: { mimeType: config.ALLOWED_MIME, data: pdfBase64 } }
    ];
  } else {
    parts = [{ text: buildTextPrompt(documentText, kbContext, rules) }];
  }

  const MAX_ATTEMPTS = 2;
  let parsed = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Only invalid JSON is retried here
    const rawText = await callGemini(parts);

    try {
      parsed = JSON.parse(rawText);
      break;
    } catch (e) {
      lastError = new AnalyzeError("AI_INVALID_JSON",
        "AI'nın cevabı ayrıştırılamadı (JSON geçersiz).", 502, { parseError: e.message });
      console.warn(`AI returned invalid JSON (attempt ${attempt}/${MAX_ATTEMPTS}). Raw:`, rawText.substring(0, 200));
      if (attempt < MAX_ATTEMPTS) {
        continue;
      }
    }
  }

  if (!parsed) {
    throw lastError || new AnalyzeError("AI_INVALID_JSON",
      "AI'nın cevabı ayrıştırılamadı.", 502);
  }

  const clean = cleanResponse(parsed, kbSources, catCfg);

  console.log("Analysis done:", {
    input: pdfBase64 ? "PDF" : "text",
    title: clean.title ? `"${clean.title.substring(0, 40)}..."` : null,
    priority: clean.priority,
    requestType: clean.requestType,
    category: clean.category,
    categorySource: catCfg.source,
    kbSources: clean.usedSources.length,
    expertiseCount: clean.expertise.length
  });

  return clean;
}

// Incident summary for the support engineer (FR-08)
async function summarizeIncident({ title, description }) {
  title = (title || "").trim();
  description = (description || "").trim();

  if (!title && !description) {
    throw new AnalyzeError("EMPTY_DOC",
      "Özet için çağrı bilgisi gerekli.", 400);
  }

  const prompt = `Sen bir ITSM destek uzmanına yardımcı olan asistansın. Sana bir destek çağrısının başlığını ve açıklamasını vereceğim. Açıklama bir kullanıcı-asistan sohbeti de olabilir. Uzmanın çağrıyı hızla kavraması için özet çıkar.

SADECE geçerli bir JSON döndür, JSON dışında hiçbir şey yazma.

Kurallar:
- "summary": sorunun/talebin 2-3 cümlelik özeti (Türkçe).
- "triedSteps": kullanıcının zaten denediği adımlar (string dizisi). Metinde açıkça geçmiyorsa [] döndür, UYDURMA.
- "likelyCauses": muhtemel nedenler (string dizisi, en fazla 3). Emin değilsen genel ve dürüst ifadeler kullan.
- "nextActions": uzmanın atması önerilen sonraki adımlar (string dizisi, en fazla 4). Kullanıcının zaten denediği adımları tekrar önerme.

Çağrı başlığı:
"""
${maskPII(title)}
"""

Çağrı açıklaması:
"""
${maskPII(description)}
"""`;

  const rawText = await callGemini([{ text: prompt }]);

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new AnalyzeError("AI_INVALID_JSON",
      "AI'nın cevabı ayrıştırılamadı (JSON geçersiz).", 502, { parseError: e.message });
  }

  const toList = (v, max) => Array.isArray(v)
    ? v.map(s => (typeof s === "string" ? s.trim() : "")).filter(s => s).slice(0, max)
    : [];

  const clean = {
    summary:      typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    triedSteps:   toList(parsed.triedSteps, 10),
    likelyCauses: toList(parsed.likelyCauses, 3),
    nextActions:  toList(parsed.nextActions, 4)
  };

  console.log("Summary generated:", { triedSteps: clean.triedSteps.length, nextActions: clean.nextActions.length });
  return clean;
}

// Revision diff (bonus). The model compares requirements only;
// affected tests are derived in code from the requirement-test links.
async function diffRequirements({ existingRequirements, tests, documentText, pdfBase64, mimeType }) {
  documentText = (documentText || "").trim();
  pdfBase64 = pdfBase64 || "";

  if (!documentText && !pdfBase64) {
    throw new AnalyzeError("EMPTY_DOC",
      "Karşılaştırma için revize doküman (PDF veya metin) gerekli.", 400);
  }

  const aExisting = Array.isArray(existingRequirements)
    ? existingRequirements.filter(r => r && r.reqId && r.text)
    : [];
  const aTests = Array.isArray(tests) ? tests.filter(t => t && t.testId) : [];

  if (aExisting.length === 0) {
    throw new AnalyzeError("NO_BASELINE",
      "Bu çağrıda karşılaştırılacak mevcut gereksinim yok. Önce ilk dokümandan gereksinim çıkarılmalı.", 400);
  }

  if (pdfBase64) {
    if (mimeType && mimeType !== config.ALLOWED_MIME) {
      throw new AnalyzeError("UNSUPPORTED_FILE_TYPE",
        "Sadece PDF dosyaları desteklenmektedir.", 415, { received: mimeType });
    }
    if (Math.floor(pdfBase64.length * 0.75) > config.MAX_PDF_BYTES) {
      throw new AnalyzeError("FILE_TOO_LARGE", "PDF dosyası çok büyük (en fazla 10 MB).", 413);
    }
  }

  const existingBlock = aExisting
    .map(r => `[${r.reqId}] (${r.type || "-"}) ${maskPII(r.text)}`)
    .join("\n");

  const rules = `Sen bir gereksinim yönetimi asistanısın. Bir talebin MEVCUT gereksinim listesini ve talep dokümanının REVİZE sürümünü vereceğim. Revize dokümanı mevcut gereksinimlerle karşılaştır.

SADECE geçerli bir JSON döndür, JSON dışında hiçbir şey yazma.

Kurallar:
- "summary": revizyonda neyin değiştiğinin 1-2 cümlelik özeti (Türkçe).
- "added": revize dokümanda olup mevcut listede KARŞILIĞI OLMAYAN yeni gereksinimler. Her eleman: {"text": "...", "type": "functional" | "business-rule" | "boundary" | "constraint" | "affected-area", "sourceRef": "dokümanın ilgili bölümü"}.
- "changed": mevcut listede olup revize dokümanda ANLAMI DEĞİŞEN gereksinimler (ör. limit değeri, kapsam, koşul değişmiş). Her eleman: {"reqId": "mevcut listedeki köşeli parantez içindeki numara", "newText": "gereksinimin yeni hali", "type": "functional" | "business-rule" | "boundary" | "constraint" | "affected-area", "reason": "ne değişti, 1 cümle"}.
- "removed": mevcut listede olup revize dokümanda artık YER ALMAYAN gereksinimler. Her eleman: {"reqId": "...", "reason": "1 cümle"}.
- Sadece ifade/yazım farkı olan, anlamı aynı kalan gereksinimleri "changed" olarak işaretleme.
- reqId olarak SADECE mevcut listede verilen numaraları kullan, UYDURMA.
- Bir gereksinim hem "changed" hem "removed" listesinde olamaz.

MEVCUT GEREKSİNİMLER:
"""
${existingBlock}
"""`;

  const parts = pdfBase64
    ? [
        { text: rules + "\n\nREVİZE DOKÜMAN aşağıda PDF olarak verilmiştir, içeriğini oku." },
        { inlineData: { mimeType: config.ALLOWED_MIME, data: pdfBase64 } }
      ]
    : [{ text: rules + `\n\nREVİZE DOKÜMAN:\n"""\n${maskPII(documentText)}\n"""` }];

  const rawText = await callGemini(parts);

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new AnalyzeError("AI_INVALID_JSON",
      "AI'nın cevabı ayrıştırılamadı (JSON geçersiz).", 502, { parseError: e.message });
  }

  const str = v => (typeof v === "string" ? v.trim() : "");
  const oExisting = {};
  aExisting.forEach(r => { oExisting[r.reqId] = r; });
  const oUsed = {};   // a reqId may appear in only one list

  const changed = (Array.isArray(parsed.changed) ? parsed.changed : [])
    .map(c => ({ reqId: str(c && c.reqId), newText: str(c && c.newText), type: str(c && c.type), reason: str(c && c.reason) }))
    .filter(c => oExisting[c.reqId] && c.newText && !oUsed[c.reqId] && (oUsed[c.reqId] = true))
    .map(c => ({
      reqId:   c.reqId,
      oldText: oExisting[c.reqId].text,
      newText: c.newText,
      type:    VALID_REQ_TYPES.includes(c.type) ? c.type : (oExisting[c.reqId].type || "functional"),
      reason:  c.reason
    }));

  const removed = (Array.isArray(parsed.removed) ? parsed.removed : [])
    .map(r => ({ reqId: str(r && r.reqId), reason: str(r && r.reason) }))
    .filter(r => oExisting[r.reqId] && !oUsed[r.reqId] && (oUsed[r.reqId] = true))
    .map(r => ({ reqId: r.reqId, oldText: oExisting[r.reqId].text, reason: r.reason }));

  const added = (Array.isArray(parsed.added) ? parsed.added : [])
    .map(a => ({ text: str(a && a.text), type: str(a && a.type), sourceRef: str(a && a.sourceRef) }))
    .filter(a => a.text)
    .map(a => ({ text: a.text, type: VALID_REQ_TYPES.includes(a.type) ? a.type : "functional", sourceRef: a.sourceRef }));

  const oReason = {};
  changed.forEach(c => { oReason[c.reqId] = "Bağlı gereksinim değişti"; });
  removed.forEach(r => { oReason[r.reqId] = "Bağlı gereksinim kaldırıldı"; });

  const affectedTests = aTests
    .filter(t => t.reqId && oReason[t.reqId])
    .map(t => ({ testId: t.testId, text: t.text, reqId: t.reqId, result: t.result || "", reason: oReason[t.reqId] }));

  const unlinkedTests = aTests.filter(t => !t.reqId).length;

  const result = {
    summary: str(parsed.summary),
    added: added,
    changed: changed,
    removed: removed,
    unchangedCount: aExisting.length - changed.length - removed.length,
    affectedTests: affectedTests,
    unlinkedTests: unlinkedTests
  };

  console.log("Revision diff done:", {
    added: added.length, changed: changed.length, removed: removed.length,
    affectedTests: affectedTests.length
  });
  return result;
}

// Release note for a resolved incident (bonus).
// The verification line is built from real test results, not by the model.
async function draftReleaseNote({ incidentNo, title, description, category, requestType, resolution, requirements, tests }) {
  title = (title || "").trim();
  description = (description || "").trim();
  resolution = (resolution || "").trim();

  if (!title && !description) {
    throw new AnalyzeError("EMPTY_DOC",
      "Değişiklik özeti için çağrı bilgisi gerekli.", 400);
  }

  const aReq = Array.isArray(requirements) ? requirements.filter(r => r && r.text) : [];
  const aTests = Array.isArray(tests) ? tests.filter(t => t && t.text) : [];

  const iPass = aTests.filter(t => t.result === "P").length;
  const iFail = aTests.filter(t => t.result === "F").length;
  const iNa   = aTests.filter(t => t.result === "N").length;
  const iCrit = aTests.filter(t => t.isCritical).length;

  let verification;
  if (aTests.length === 0) {
    verification = "Bu çağrı için kayıtlı test adımı bulunmamaktadır.";
  } else {
    verification = `${aTests.length} test adımından ${iPass} başarılı, ${iFail} başarısız, ${iNa} uygulanamaz` +
      (iCrit ? ` (${iCrit} kritik test dahil).` : ".");
  }

  const reqBlock = aReq.length
    ? aReq.map(r => `- ${r.id ? r.id + ": " : ""}${r.text}`).join("\n")
    : "(gereksinim kaydı yok)";

  const testBlock = aTests.length
    ? aTests.map(t => `- [${t.result || "-"}] (${t.type || "-"}) ${t.text}${t.note ? " | Not: " + t.note : ""}`).join("\n")
    : "(test kaydı yok)";

  const prompt = `Sen bir ITSM değişiklik yönetimi asistanısın. Çözülmüş bir çağrının bilgilerini vereceğim. Bu bilgilerden kısa ve profesyonel bir değişiklik özeti (release note) hazırla.

SADECE geçerli bir JSON döndür, JSON dışında hiçbir şey yazma.

Kurallar:
- "summary": yapılan değişikliğin veya çözümün 1-2 cümlelik özeti (Türkçe).
- "scope": etkilenen sistem, modül veya iş süreci (tek cümle).
- "changes": yapılan değişiklikler / uygulanan çözüm adımları (string dizisi, en fazla 6). SADECE verilen bilgilerden çıkar. Uzmanın yazdığı ÇÖZÜM metni varsa onu temel al; gereksinimler varsa onları "uygulanan değişiklik" olarak ifade et.
- "userImpact": son kullanıcıya etkisi, kullanıcının neyi farklı göreceği (1-2 cümle).
- Test sayısı veya yüzde YAZMA; doğrulama bilgisi sistem tarafından ayrıca eklenecek.
- Verilen bilgide olmayan teknik detayları UYDURMA.

Çağrı başlığı:
"""
${maskPII(title)}
"""

Çağrı açıklaması:
"""
${maskPII(description)}
"""

Uzmanın girdiği çözüm:
"""
${maskPII(resolution) || "(çözüm açıklaması girilmemiş)"}
"""

Gereksinimler:
"""
${maskPII(reqBlock)}
"""

Testler ve sonuçları (P=Başarılı, F=Başarısız, N=Uygulanamaz):
"""
${maskPII(testBlock)}
"""`;

  const rawText = await callGemini([{ text: prompt }]);

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new AnalyzeError("AI_INVALID_JSON",
      "AI'nın cevabı ayrıştırılamadı (JSON geçersiz).", 502, { parseError: e.message });
  }

  const str = v => (typeof v === "string" ? v.trim() : "");
  const clean = {
    summary:    str(parsed.summary),
    scope:      str(parsed.scope),
    changes:    Array.isArray(parsed.changes)
                  ? parsed.changes.map(str).filter(s => s).slice(0, 6)
                  : [],
    userImpact: str(parsed.userImpact),
    verification: verification
  };

  // Older incidents may have no request type
  const typeText = requestType === "request"  ? "Talep (geliştirme/değişiklik)"
                 : requestType === "incident" ? "Arıza"
                 : "Belirtilmemiş";
  const lines = [
    `DEĞİŞİKLİK ÖZETİ — Çağrı ${incidentNo || ""}`.trim(),
    `Başlık: ${title}`,
    `Tür: ${typeText}${category ? " | Kategori: " + category : ""}`,
    "",
    "Özet:",
    clean.summary || "-",
    "",
    "Kapsam:",
    clean.scope || "-",
    "",
    "Yapılan Değişiklikler:",
    clean.changes.length ? clean.changes.map(c => "- " + c).join("\n") : "-",
    "",
    "Doğrulama:",
    clean.verification,
    "",
    "Kullanıcıya Etkisi:",
    clean.userImpact || "-"
  ];
  clean.noteText = lines.join("\n");

  console.log("Release note generated:", { incident: incidentNo, changes: clean.changes.length, tests: aTests.length });
  return clean;
}

// KB article draft (FR-10): problem, cause, solution, check steps
async function draftKnowledgeArticle({ title, description, resolution, testNotes }) {
  title = (title || "").trim();
  description = (description || "").trim();
  resolution = (resolution || "").trim();
  testNotes = (testNotes || "").trim();

  if (!title && !description) {
    throw new AnalyzeError("EMPTY_DOC",
      "Makale taslağı için çağrı bilgisi gerekli.", 400);
  }

  const prompt = `Sen bir ITSM bilgi yönetimi asistanısın. Çözülmüş bir destek çağrısının bilgilerini vereceğim. Bu bilgiyi, benzer sorun yaşayan başka kişilerin kullanabileceği bir bilgi bankası makalesine dönüştür.

SADECE geçerli bir JSON döndür, JSON dışında hiçbir şey yazma.

Kurallar:
- "title": makalenin kısa ve aranabilir başlığı (~en fazla 80 karakter). Çağrı başlığını aynen kopyalama; genelleştir.
- "problem": sorunun belirtileri, kullanıcının ne yaşadığı (2-3 cümle, Türkçe).
- "cause": sorunun kök nedeni (1-2 cümle). ÖNCE uzmanın girdiği çözüm metnine bak; kök neden orada yazıyorsa onu kullan. Hiçbir yerde yoksa "Kök neden kayıtlarda belirtilmemiştir." yaz, UYDURMA.
- "solution": sorunu çözmek için izlenecek adımlar. Uzmanın çözüm metnini temel al; numaralı, uygulanabilir adımlar halinde tek bir metin olarak yaz.
- "checkSteps": çözümün işe yarayıp yaramadığını doğrulamak için yapılacak kontroller. Tek bir metin olarak yaz.
- "tags": aramayı kolaylaştıracak anahtar kelimeler, virgülle ayrılmış tek metin (örn: "VPN, bağlantı, uzaktan erişim").

Önemli: Verilen bilgide olmayan teknik detayları UYDURMA. Emin olmadığın yerde genel ve dürüst ifadeler kullan.

Çağrı başlığı:
"""
${maskPII(title)}
"""

Çağrı açıklaması:
"""
${maskPII(description)}
"""

Uzmanın girdiği çözüm (en güvenilir kaynak):
"""
${maskPII(resolution) || "(çözüm açıklaması girilmemiş)"}
"""

Yapılan testler ve notlar:
"""
${maskPII(testNotes) || "(test kaydı yok)"}
"""`;

  const parts = [{ text: prompt }];
  const rawText = await callGemini(parts);

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    throw new AnalyzeError("AI_INVALID_JSON",
      "AI'nın cevabı ayrıştırılamadı (JSON geçersiz).", 502, { parseError: e.message });
  }

  const str = (v, max) =>
    (typeof v === "string" ? v.trim() : "").substring(0, max);

  const clean = {
    title:      str(parsed.title, 100),
    problem:    str(parsed.problem, 255),
    cause:      str(parsed.cause, 255),
    solution:   str(parsed.solution, 1000),
    checkSteps: str(parsed.checkSteps, 500),
    tags:       str(parsed.tags, 200)
  };

  console.log("KB draft generated:", clean.title.substring(0, 50));
  return clean;
}

module.exports = { analyze, chat, summarizeIncident, diffRequirements, draftReleaseNote, draftKnowledgeArticle, AnalyzeError };
