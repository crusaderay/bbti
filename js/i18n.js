const SUPPORTED_LANGS = ['zh', 'en'];
const DEFAULT_LANG = 'zh';
const STORAGE_KEY = 'bbti-lang';

function normalizeLang(value) {
  if (!value) return null;
  const lower = String(value).toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('en')) return 'en';
  return null;
}

export function detectLang() {
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGS.includes(stored)) {
      return stored;
    }
  } catch (_) {
    // localStorage might be unavailable (private mode, etc.)
  }

  const candidates = [];
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) candidates.push(navigator.language);
    if (navigator.userLanguage) candidates.push(navigator.userLanguage);
  }

  for (const candidate of candidates) {
    const lang = normalizeLang(candidate);
    if (lang) return lang;
  }

  return DEFAULT_LANG;
}

export function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, lang);
  } catch (_) {
    // Ignore storage failures — lang will still be reflected in the URL / session state.
  }
}

export function otherLang(lang) {
  return lang === 'en' ? 'zh' : 'en';
}

export function isSupportedLang(lang) {
  return SUPPORTED_LANGS.includes(lang);
}

function dataPrefix(lang) {
  return lang === 'en' ? './data/en' : './data';
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

export async function loadLocalizedData(lang) {
  const dataDir = dataPrefix(lang);
  // `memes`, `ui`, `questions`, `archetypes`, `personality-copy` live per-language.
  // `dimensions.json` also has per-language copies so the model labels (IQ/LOYAL/…) match the UI language.
  const [questions, dimensions, archetypes, memes, personalityCopy, ui] = await Promise.all([
    fetchJson(`${dataDir}/questions.json`),
    fetchJson(`${dataDir}/dimensions.json`),
    fetchJson(`${dataDir}/archetypes.json`),
    fetchJson(`${dataDir}/memes.json`),
    fetchJson(`${dataDir}/personality-copy.json`),
    fetchJson(`${dataDir}/ui.json`),
  ]);

  return { questions, dimensions, archetypes, memes, personalityCopy, ui, lang };
}

export function interpolate(template, values) {
  if (!template) return '';
  return String(template).replace(/\{(\w+)\}/g, (match, key) => {
    if (values && Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    return match;
  });
}

export { SUPPORTED_LANGS, DEFAULT_LANG };
