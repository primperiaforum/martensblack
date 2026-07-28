const DEFAULT_ALLOWED_ORIGINS = ["https://primperiaforum.github.io"];

const DEFAULT_BITRIX_FIELDS = {
  title: "ф-б-АПК-26-09-оф",
  id_category: "27",
  formid: "111"
};

const FIELD_RULES = {
  fname: { label: "Имя", required: true, max: 60, type: "person" },
  lname: { label: "Фамилия", required: true, max: 80, type: "person" },
  tname: { label: "Отчество", required: false, max: 80, type: "person" },
  phone: { label: "Телефон", required: true, max: 24, type: "phone" },
  email: { label: "Email", required: true, max: 254, type: "email" },
  city: { label: "Город", required: true, max: 80, type: "city" },
  status: { label: "Должность", required: true, max: 120, type: "business" },
  company: { label: "Компания", required: true, max: 160, type: "business" },
  sfera: { label: "Сфера деятельности", required: true, max: 180, type: "business" }
};

const TRACKING_FIELD_RULES = {
  page_url: { max: 600, type: "url" },
  source_origin: { max: 160, type: "url" },
  source_path: { max: 400, type: "tracking" },
  referrer: { max: 600, type: "url" },
  utm_source: { max: 160, type: "tracking" },
  utm_medium: { max: 160, type: "tracking" },
  utm_campaign: { max: 220, type: "tracking" },
  utm_content: { max: 220, type: "tracking" },
  utm_term: { max: 220, type: "tracking" },
  utm_id: { max: 120, type: "tracking" },
  gclid: { max: 260, type: "tracking" },
  yclid: { max: 260, type: "tracking" },
  fbclid: { max: 260, type: "tracking" }
};

const PERSON_PATTERN = /^\p{L}+(?:[\s'-]\p{L}+)*$/u;
const CITY_PATTERN = /^\p{L}+(?:[\s.'-]\p{L}+)*$/u;
const BUSINESS_PATTERN = /^[\p{L}\p{N}\s"'«».,:;()№&+/-]+$/u;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SAFE_URL_PATTERN = /^https:\/\/[^\s<>"']+$/i;
const TRACKING_PATTERN = /^[\p{L}\p{N}\s._~:/?#[\]@!$&'()*+,;=%-]*$/u;

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};

async function handleRequest(request, env = {}) {
  const origin = normalizeOrigin(request.headers.get("Origin") || "");
  const cors = buildCorsHeaders(origin, env);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: cors.allowed ? 204 : 403,
      headers: cors.headers
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, cors.headers);
  }

  if (!cors.allowed) {
    return jsonResponse({ ok: false, error: "forbidden_origin" }, 403, cors.headers);
  }

  const url = new URL(request.url);
  if (url.pathname !== "/lead") {
    return jsonResponse({ ok: false, error: "not_found" }, 404, cors.headers);
  }

  const crmEndpoint = String(env.BITRIX_WEBHOOK_URL || "").trim();
  if (!SAFE_URL_PATTERN.test(crmEndpoint)) {
    return jsonResponse({ ok: false, error: "proxy_not_configured" }, 500, cors.headers);
  }

  const maxBodyBytes = getPositiveInt(env.MAX_BODY_BYTES, 16000);
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBodyBytes) {
    return jsonResponse({ ok: false, error: "payload_too_large" }, 413, cors.headers);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (error) {
    return jsonResponse({ ok: false, error: "bad_form_data" }, 400, cors.headers);
  }

  if (hasBotTrap(formData)) {
    return jsonResponse({ ok: true }, 200, cors.headers);
  }

  if (isTooFast(formData, env)) {
    return jsonResponse({ ok: false, error: "too_fast" }, 429, cors.headers);
  }

  const validation = validatePayload(formData);
  if (!validation.ok) {
    return jsonResponse(
      { ok: false, error: "validation_failed", fields: validation.errors },
      400,
      cors.headers
    );
  }

  const clientIpHash = await sha256(getClientIp(request));
  const ipLimit = await hitRateLimit(env, `ip:${clientIpHash}`, {
    limit: getPositiveInt(env.RATE_LIMIT_IP_MAX, 5),
    windowSeconds: getPositiveInt(env.RATE_LIMIT_IP_WINDOW_SECONDS, 600)
  });

  if (!ipLimit.allowed) {
    return jsonResponse({ ok: false, error: "too_many_requests" }, 429, cors.headers);
  }

  const leadHash = await sha256(`${validation.data.email}:${validation.data.phone.replace(/\D/g, "")}`);
  const leadLimit = await hitRateLimit(env, `lead:${leadHash}`, {
    limit: getPositiveInt(env.RATE_LIMIT_LEAD_MAX, 2),
    windowSeconds: getPositiveInt(env.RATE_LIMIT_LEAD_WINDOW_SECONDS, 86400)
  });

  if (!leadLimit.allowed) {
    return jsonResponse({ ok: false, error: "too_many_requests" }, 429, cors.headers);
  }

  const outbound = new FormData();
  outbound.set("title", getSafeEnvValue(env.BITRIX_TITLE, DEFAULT_BITRIX_FIELDS.title, 80));
  outbound.set("id_category", getSafeEnvValue(env.BITRIX_CATEGORY_ID, DEFAULT_BITRIX_FIELDS.id_category, 20));
  outbound.set("formid", getSafeEnvValue(env.BITRIX_FORM_ID, DEFAULT_BITRIX_FIELDS.formid, 20));

  for (const [name, value] of Object.entries(validation.data)) {
    outbound.set(name, value);
  }

  outbound.set("checkbox", "Да");
  appendAttributionFields(outbound, request, origin, validation.tracking);

  let crmResponse;
  try {
    crmResponse = await fetchWithTimeout(
      crmEndpoint,
      {
        method: "POST",
        body: outbound
      },
      getPositiveInt(env.BITRIX_TIMEOUT_MS, 8000)
    );
  } catch (error) {
    return jsonResponse({ ok: false, error: "crm_unavailable" }, 502, cors.headers);
  }

  if (!crmResponse.ok) {
    return jsonResponse({ ok: false, error: "crm_rejected" }, 502, cors.headers);
  }

  return jsonResponse({ ok: true }, 200, cors.headers);
}

function buildCorsHeaders(origin, env) {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const allowed = Boolean(origin && allowedOrigins.has(origin));
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };

  if (allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return { allowed, headers };
}

function parseAllowedOrigins(value) {
  const source = String(value || "").trim()
    ? String(value).split(",")
    : DEFAULT_ALLOWED_ORIGINS;

  return new Set(source.map((item) => normalizeOrigin(item.trim())).filter(Boolean));
}

function normalizeOrigin(value) {
  if (!value) return "";

  try {
    return new URL(value).origin;
  } catch (error) {
    return value.replace(/\/+$/, "");
  }
}

function jsonResponse(payload, status, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function hasBotTrap(formData) {
  return cleanText(formData.get("homepage"), 120).length > 0;
}

function isTooFast(formData, env) {
  const startedAt = Number(formData.get("form_started_at") || 0);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return false;

  const elapsed = Date.now() - startedAt;
  const minSubmitMs = getPositiveInt(env.MIN_SUBMIT_MS, 2500);
  return elapsed >= 0 && elapsed < minSubmitMs;
}

function validatePayload(formData) {
  const errors = {};
  const data = {};

  for (const [name, rule] of Object.entries(FIELD_RULES)) {
    const value = cleanText(formData.get(name), rule.max);
    const error = validateField(value, rule);

    if (error) {
      errors[name] = error;
      continue;
    }

    data[name] = rule.type === "email" ? value.toLowerCase() : value;
  }

  const checkbox = cleanText(formData.get("checkbox"), 20);
  if (!["Да", "on", "true", "1"].includes(checkbox)) {
    errors.checkbox = "required";
  }

  return {
    ok: Object.keys(errors).length === 0,
    data,
    tracking: validateTracking(formData),
    errors
  };
}

function validateTracking(formData) {
  const tracking = {};

  for (const [name, rule] of Object.entries(TRACKING_FIELD_RULES)) {
    const value = cleanText(formData.get(name), rule.max);
    if (!value || value.length > rule.max || containsDangerousChars(value)) continue;
    if (rule.type === "url" && !isSafeHttpUrl(value)) continue;
    if (rule.type === "tracking" && !TRACKING_PATTERN.test(value)) continue;
    tracking[name] = value;
  }

  return tracking;
}

function validateField(value, rule) {
  if (rule.required && !value) return "required";
  if (!value) return "";
  if (value.length > rule.max) return "too_long";
  if (containsDangerousChars(value)) return "bad_chars";

  if (rule.type === "email" && !EMAIL_PATTERN.test(value)) return "bad_email";

  if (rule.type === "phone") {
    const digits = value.replace(/\D/g, "");
    if (!/^\+?[\d\s()-]+$/.test(value) || digits.length < 10 || digits.length > 15) {
      return "bad_phone";
    }
  }

  if (rule.type === "person" && !PERSON_PATTERN.test(value)) return "bad_person";
  if (rule.type === "city" && !CITY_PATTERN.test(value)) return "bad_city";
  if (rule.type === "business" && (!BUSINESS_PATTERN.test(value) || countLetters(value) < 2)) {
    return "bad_business_text";
  }

  return "";
}

function cleanText(value, maxLength) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength + 1);
}

function containsDangerousChars(value) {
  return /[<>{}\[\]`\\]/.test(value);
}

function countLetters(value) {
  return (value.match(/\p{L}/gu) || []).length;
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function appendAttributionFields(outbound, request, origin, tracking) {
  const requestUrl = new URL(request.url);
  const sourceOrigin = origin;
  const pageUrl = normalizePageUrl(tracking.page_url, sourceOrigin, sourceOrigin);
  const referrer = normalizePageUrl(tracking.referrer, "");
  const sourceHost = getHostname(sourceOrigin) || requestUrl.hostname;

  outbound.set("website", sourceOrigin || `https://${sourceHost}`);
  outbound.set("source_website", sourceHost);
  outbound.set("source_origin", sourceOrigin);
  outbound.set("page_url", pageUrl);
  outbound.set("landing_page", pageUrl);
  outbound.set("source_path", tracking.source_path || "");
  outbound.set("referrer", referrer);

  for (const name of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id"]) {
    outbound.set(name, tracking[name] || "");
    outbound.set(name.toUpperCase(), tracking[name] || "");
  }

  for (const name of ["gclid", "yclid", "fbclid"]) {
    outbound.set(name, tracking[name] || "");
  }
}

function normalizePageUrl(value, fallbackOrigin, requiredOrigin = "") {
  if (!value) return fallbackOrigin;

  try {
    const url = new URL(value);
    const isHttp = url.protocol === "https:" || url.protocol === "http:";
    const hasExpectedOrigin = !requiredOrigin || url.origin === requiredOrigin;
    return isHttp && hasExpectedOrigin ? url.href : fallbackOrigin;
  } catch (error) {
    return fallbackOrigin;
  }
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (error) {
    return false;
  }
}

function getHostname(value) {
  try {
    return new URL(value).hostname;
  } catch (error) {
    return "";
  }
}

async function hitRateLimit(env, key, options) {
  if (env.RATE_LIMIT && typeof env.RATE_LIMIT.get === "function") {
    return hitKvRateLimit(env.RATE_LIMIT, key, options);
  }

  return hitMemoryRateLimit(key, options);
}

async function hitKvRateLimit(kv, key, { limit, windowSeconds }) {
  const record = (await kv.get(key, "json")) || { count: 0 };
  const nextCount = Number(record.count || 0) + 1;

  if (nextCount > limit) {
    return { allowed: false };
  }

  await kv.put(key, JSON.stringify({ count: nextCount }), {
    expirationTtl: windowSeconds
  });

  return { allowed: true };
}

function hitMemoryRateLimit(key, { limit, windowSeconds }) {
  const now = Date.now();
  const expiresAt = now + windowSeconds * 1000;
  const store = getMemoryStore();
  const current = store.get(key);

  if (!current || current.expiresAt <= now) {
    store.set(key, { count: 1, expiresAt });
    pruneMemoryStore(store, now);
    return { allowed: true };
  }

  if (current.count >= limit) {
    return { allowed: false };
  }

  current.count += 1;
  store.set(key, current);
  return { allowed: true };
}

function getMemoryStore() {
  if (!globalThis.__MARTENSBLACK_RATE_LIMIT__) {
    globalThis.__MARTENSBLACK_RATE_LIMIT__ = new Map();
  }

  return globalThis.__MARTENSBLACK_RATE_LIMIT__;
}

function pruneMemoryStore(store, now) {
  if (store.size < 500) return;

  for (const [key, record] of store.entries()) {
    if (record.expiresAt <= now) {
      store.delete(key);
    }
  }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function getSafeEnvValue(value, fallback, maxLength) {
  const cleaned = cleanText(value || fallback, maxLength);
  return cleaned || fallback;
}

export const __test__ = {
  cleanText,
  containsDangerousChars,
  handleRequest,
  validatePayload
};
