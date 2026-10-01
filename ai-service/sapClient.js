// Reads category configuration from SAP Gateway (ZITSM_CATEGORY, maintained via SM30).
// Results are cached briefly; if SAP is unreachable the config.js list is used
// so AI analysis keeps working during an SAP outage.

const config = require("./config");

const CACHE_MS = 5 * 60 * 1000;

let cache = null;        // { categories: [{name, supportGroup}], supportGroups, source, loadedAt }
let loading = null;      // shared promise so concurrent requests make a single SAP call

function authHeader() {
  const user = process.env.SAP_USER || "";
  const pass = process.env.SAP_PASSWORD || "";
  return "Basic " + Buffer.from(user + ":" + pass).toString("base64");
}

async function fetchFromSap() {
  const base = (process.env.SAP_ODATA_URL || "").replace(/\/+$/, "");
  if (!base || !process.env.SAP_USER) {
    throw new Error("SAP_ODATA_URL / SAP_USER .env'de tanimli degil");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const r = await fetch(`${base}/CategorySet?$format=json`, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      signal: controller.signal
    });
    if (!r.ok) {
      throw new Error("SAP HTTP " + r.status);
    }
    const data = await r.json();
    const rows = (data && data.d && data.d.results) || [];

    const categories = rows
      .filter(c => c.CategoryName && c.IsActive === "X")
      .map(c => ({ name: c.CategoryName.trim(), supportGroup: (c.SupportGroup || "").trim() }));

    if (categories.length === 0) {
      throw new Error("SAP'de aktif kategori yok");
    }
    return categories;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Allowed categories and support groups.
 * @returns {Promise<{categories: Array<{name, supportGroup}>, supportGroups: string[], source: "SAP"|"config"}>}
 */
async function getCategoryConfig() {
  if (cache && (Date.now() - cache.loadedAt) < CACHE_MS) {
    return cache;
  }
  if (loading) {
    return loading;
  }

  loading = (async () => {
    let categories, source;
    try {
      categories = await fetchFromSap();
      source = "SAP";
    } catch (err) {
      console.warn("Could not read categories from SAP, using config.js fallback:", err.message);
      categories = (config.ALLOWED_CATEGORIES || []).map(n => ({ name: n, supportGroup: "" }));
      source = "config";
    }

    // Default groups from categories plus the expertise list, deduplicated
    const groups = new Set();
    categories.forEach(c => { if (c.supportGroup) groups.add(c.supportGroup); });
    (config.ALLOWED_EXPERTISE || []).forEach(g => groups.add(g));

    cache = {
      categories: categories,
      supportGroups: Array.from(groups),
      source: source,
      // On fallback, retry SAP after 1 minute instead of the full cache period
      loadedAt: source === "SAP" ? Date.now() : Date.now() - CACHE_MS + 60 * 1000
    };
    loading = null;
    return cache;
  })();

  return loading;
}

module.exports = { getCategoryConfig };
