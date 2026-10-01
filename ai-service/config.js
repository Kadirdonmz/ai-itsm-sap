// Central settings for the AI service.

module.exports = {
  // Generative model
  MODEL: "gemini-3.6-flash",

  // Embeddings (768 dims: good quality, 4x smaller index than 3072)
  EMBEDDING_MODEL: "gemini-embedding-001",
  EMBEDDING_DIM: 768,
  EMBEDDING_TIMEOUT_MS: 30000,

  // Semantic search
  SIMILARITY_TOP_K: 5,
  SIMILARITY_MIN_SCORE: 0.70,
  RAG_MIN_SCORE: 0.55,

  // Recurring problem detection (FR-09)
  RECURRING_MIN_SCORE: 0.72,
  RECURRING_THRESHOLD: 3,
  RECURRING_WINDOW_DAYS: 7,

  INDEX_FILE: "./data/index.json",

  // The model may only pick from these lists
  ALLOWED_EXPERTISE: [
    "SAP Basis", "SAP ABAP", "Network", "Database",
    "Security", "Hardware", "Application Support"
  ],

  // Fallback categories (FR-05); the live list comes from SAP ZITSM_CATEGORY
  ALLOWED_CATEGORIES: [
    "SAP > MM > Satınalma",
    "SAP > MM > Stok Yönetimi",
    "SAP > SD > Satış Siparişi",
    "SAP > FI > Muhasebe",
    "SAP > Basis > Yetki / Kullanıcı",
    "SAP > ABAP > Özel Geliştirme",
    "Network > VPN",
    "Network > LAN / Wi-Fi",
    "Donanım > Bilgisayar",
    "Donanım > Yazıcı",
    "Güvenlik > Erişim / Yetki",
    "Veritabanı > Performans",
    "Uygulama > Genel Hata",
    "Diğer"
  ],

  // Upload rules
  ALLOWED_MIME: "application/pdf",
  MAX_PDF_BYTES: 10 * 1024 * 1024,

  GEMINI_TIMEOUT_MS: 60000,

  PORT: process.env.PORT || 3001,

  // CORS whitelist (Fiori dev server)
  ALLOWED_ORIGINS: [
    "http://localhost:8080"
  ]
};
