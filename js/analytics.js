function hasGtag() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

export function trackEvent(name, params = {}) {
  if (!hasGtag()) return;
  window.gtag('event', name, params);
}

export function buildQuizParams({ lang, totalQuestions, source }) {
  return {
    quiz_language: lang,
    question_count: totalQuestions,
    start_source: source,
  };
}

export function buildResultParams({ lang, result, answers, totalQuestions }) {
  return {
    quiz_language: lang,
    question_count: totalQuestions,
    answer_count: Object.keys(answers ?? {}).length,
    archetype_code: result?.archetype?.code ?? '',
    archetype_name: result?.archetype?.name ?? '',
    matched_by: result?.matchedBy ?? '',
    rarity: result?.archetype?.rarity ?? '',
  };
}

export function buildShareParams({ lang, result, action }) {
  return {
    quiz_language: lang,
    share_action: action,
    archetype_code: result?.archetype?.code ?? '',
    archetype_name: result?.archetype?.name ?? '',
  };
}

export function buildLanguageParams({ from, to, page }) {
  return {
    from_language: from,
    to_language: to,
    page_context: page,
  };
}
