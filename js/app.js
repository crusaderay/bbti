import { renderQuestionView } from './quiz.js';
import { renderGalleryView, renderResultView, normalizeArchetypeImages } from './result.js';
import { matchPersonality } from './scorer.js';
import { copyShareText, shareResult } from './share.js';
import {
  buildLanguageParams,
  buildQuizParams,
  buildResultParams,
  buildShareParams,
  trackEvent,
} from './analytics.js';
import {
  detectLang,
  setLang,
  loadLocalizedData,
  otherLang,
  isSupportedLang,
  interpolate,
} from './i18n.js';

const PAGES = {
  LANDING: 'landing',
  QUIZ: 'quiz',
  LOADING: 'loading',
  RESULT: 'result',
  GALLERY: 'gallery',
};

const state = {
  page: PAGES.LANDING,
  lang: 'zh',
  data: null,
  answers: {},
  currentQuestionIndex: 0,
  result: null,
  landingHook: null,
  loadingIntervalId: null,
  loadingTimeoutId: null,
  loadingStepIndex: 0,
};

const root = document.getElementById('app-root');
const pages = {
  [PAGES.LANDING]: document.getElementById('page-landing'),
  [PAGES.QUIZ]: document.getElementById('page-quiz'),
  [PAGES.LOADING]: document.getElementById('page-loading'),
  [PAGES.RESULT]: document.getElementById('page-result'),
  [PAGES.GALLERY]: document.getElementById('page-gallery'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function currentUi() {
  return state.data?.ui ?? {};
}

function mergeArchetypeCopy(archetypes, personalityCopy) {
  const copyMap = new Map(
    (personalityCopy?.entries ?? []).map((entry) => [entry.code, entry]),
  );

  return {
    ...archetypes,
    archetypes: archetypes.archetypes.map((archetype) => ({
      ...archetype,
      ...(copyMap.get(archetype.code) ?? {}),
    })),
  };
}

function pickMeme(memes, archetypeCode) {
  const related = memes.filter((meme) => meme.relatedTypes.includes(archetypeCode));
  const pool = related.length > 0 ? related : memes;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

function clearLoadingTimers() {
  if (state.loadingIntervalId) {
    window.clearInterval(state.loadingIntervalId);
    state.loadingIntervalId = null;
  }

  if (state.loadingTimeoutId) {
    window.clearTimeout(state.loadingTimeoutId);
    state.loadingTimeoutId = null;
  }
}

function activatePage(page) {
  Object.entries(pages).forEach(([key, element]) => {
    element.classList.toggle('is-active', key === page);
  });
  state.page = page;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function totalQuestions() {
  return state.data?.questions?.questions?.length ?? 0;
}

function applyLocaleChrome() {
  const ui = currentUi();
  const htmlLang = ui?.htmlLang ?? (state.lang === 'en' ? 'en' : 'zh-CN');
  document.documentElement.setAttribute('lang', htmlLang);

  if (ui?.meta?.title) {
    document.title = ui.meta.title;
  }

  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta && ui?.meta?.description) {
    descMeta.setAttribute('content', ui.meta.description);
  }

  const header = ui?.header ?? {};

  const brandMark = document.querySelector('[data-brand-mark]');
  if (brandMark) {
    brandMark.setAttribute('aria-label', header.returnHomeAria ?? '');
    const strongEl = brandMark.querySelector('strong');
    const smallEl = brandMark.querySelector('small');
    if (strongEl) strongEl.textContent = header.brandName ?? 'BBTI';
    if (smallEl) smallEl.textContent = header.brandSubtitle ?? '';
  }

  const galleryLink = document.querySelector('[data-nav-gallery]');
  if (galleryLink) galleryLink.textContent = header.galleryLink ?? '';

  const langBtn = document.querySelector('[data-action="toggle-lang"]');
  if (langBtn) {
    langBtn.textContent = header.langSwitchLabel ?? '';
    langBtn.setAttribute('aria-label', header.langSwitchAria ?? '');
  }
}

function pickLandingHook(ui) {
  const hooks = Array.isArray(ui?.landing?.hooks) ? ui.landing.hooks : [];
  if (hooks.length === 0) return null;
  if (state.landingHook && hooks.includes(state.landingHook)) return state.landingHook;
  return hooks[Math.floor(Math.random() * hooks.length)];
}

function renderLanding() {
  const ui = currentUi();
  const landingUi = ui?.landing ?? {};
  const totalQuestions = state.data?.questions?.questions?.length ?? 25;
  const landingHook = pickLandingHook(ui) ?? { lead: '', punch: '' };
  state.landingHook = landingHook;

  const metaCopy = interpolate(landingUi.metaTemplate ?? '', { total: totalQuestions });

  pages[PAGES.LANDING].innerHTML = `
    <section class="landing-layout">
      <article class="landing-hero card">
        <div class="landing-hero__intro">
          <span class="hero-chip">
            <img src="./img/logo.svg" alt="">
            BBTI
          </span>
          <p class="eyebrow">${escapeHtml(landingUi.eyebrow ?? '')}</p>
          <h1>${escapeHtml(landingHook.lead)}<br>${escapeHtml(landingHook.punch)}</h1>
          <p class="landing-hero__subtitle">${escapeHtml(landingUi.subtitle ?? '')}</p>
          <p class="landing-hero__meta">${escapeHtml(metaCopy)}</p>
        </div>
        <div class="landing-hero__actions">
          <button class="button button--primary button--pulse" type="button" data-action="start-quiz">${escapeHtml(landingUi.startButton ?? '')}</button>
        </div>
      </article>
    </section>
  `;
}

function renderQuiz() {
  const { questions } = state.data.questions;
  const currentQuestion = questions[state.currentQuestionIndex];
  const ui = currentUi();

  pages[PAGES.QUIZ].innerHTML = renderQuestionView({
    question: currentQuestion,
    index: state.currentQuestionIndex,
    total: questions.length,
    ui,
  });

  requestAnimationFrame(() => {
    document.querySelector('[data-question-card]')?.classList.add('is-visible');
  });
}

function renderLoading() {
  const ui = currentUi();
  const loadingUi = ui?.loading ?? {};
  const steps = Array.isArray(loadingUi.steps) ? loadingUi.steps : [];

  pages[PAGES.LOADING].innerHTML = `
    <div class="loading-layout card">
      <div class="loading-ball">🏀</div>
      <p class="eyebrow">${escapeHtml(loadingUi.eyebrow ?? '')}</p>
      <h1>${escapeHtml(loadingUi.title ?? '')}</h1>
      <ul class="loading-list">
        ${steps
          .map(
            (step, index) => `
              <li class="loading-step${index === state.loadingStepIndex ? ' is-active' : ''}">
                <span>▶</span>
                <span>${escapeHtml(step)}</span>
              </li>
            `,
          )
          .join('')}
      </ul>
    </div>
  `;
}

function renderResult() {
  if (!state.result) return;
  const ui = currentUi();
  const meme = pickMeme(state.data.memes.memes, state.result.archetype.code);
  pages[PAGES.RESULT].innerHTML = renderResultView({
    result: state.result,
    dimensions: state.data.dimensions.dimensions,
    meme,
    ui,
  });
  normalizeArchetypeImages(pages[PAGES.RESULT]);
}

function renderGallery() {
  const ui = currentUi();
  pages[PAGES.GALLERY].innerHTML = renderGalleryView({
    archetypes: state.data.archetypes.archetypes,
    currentCode: state.result?.archetype.code ?? null,
    ui,
  });
  normalizeArchetypeImages(pages[PAGES.GALLERY]);
}

function startQuiz(source = 'landing') {
  clearLoadingTimers();
  state.answers = {};
  state.result = null;
  state.currentQuestionIndex = 0;
  renderQuiz();
  activatePage(PAGES.QUIZ);
  trackEvent('start_quiz', buildQuizParams({
    lang: state.lang,
    totalQuestions: totalQuestions(),
    source,
  }));
}

function revealResult() {
  const result = matchPersonality({
    answers: state.answers,
    questions: state.data.questions.questions,
    dimensions: state.data.dimensions.dimensions,
    archetypes: state.data.archetypes.archetypes,
    ui: currentUi(),
  });

  state.result = result;
  renderResult();
  activatePage(PAGES.RESULT);
  trackEvent('complete_quiz', buildResultParams({
    lang: state.lang,
    result,
    answers: state.answers,
    totalQuestions: totalQuestions(),
  }));
}

function startLoadingSequence() {
  state.loadingStepIndex = 0;
  renderLoading();
  activatePage(PAGES.LOADING);

  clearLoadingTimers();

  const ui = currentUi();
  const stepsLength = Array.isArray(ui?.loading?.steps) ? ui.loading.steps.length : 6;

  state.loadingIntervalId = window.setInterval(() => {
    state.loadingStepIndex = (state.loadingStepIndex + 1) % stepsLength;
    renderLoading();
  }, 320);

  state.loadingTimeoutId = window.setTimeout(() => {
    clearLoadingTimers();
    revealResult();
  }, 2200);
}

function nextQuestion() {
  const total = state.data.questions.questions.length;

  if (state.currentQuestionIndex >= total - 1) {
    startLoadingSequence();
    return;
  }

  state.currentQuestionIndex += 1;
  renderQuiz();
}

function showLanding() {
  clearLoadingTimers();
  renderLanding();
  activatePage(PAGES.LANDING);
}

function showGallery() {
  renderGallery();
  activatePage(PAGES.GALLERY);
}

function showResult() {
  if (!state.result) {
    showLanding();
    return;
  }

  renderResult();
  activatePage(PAGES.RESULT);
}

async function handleShareAction(callback, eventName, actionLabel) {
  if (!state.result) return;

  const ui = currentUi();
  const resultUi = ui?.result ?? {};
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  try {
    const text = await callback(state.result, ui);
    trackEvent(eventName, buildShareParams({
      lang: state.lang,
      result: state.result,
      action: actionLabel,
    }));
    if (trigger) {
      const original = trigger.textContent;
      trigger.textContent = text ? (resultUi.buttonDone ?? '') : (resultUi.buttonComplete ?? '');
      window.setTimeout(() => {
        trigger.textContent = original;
      }, 1200);
    }
  } catch (error) {
    console.error(error);
    window.alert(resultUi.shareError ?? 'Share action failed.');
  }
}

function selectOption(button) {
  const questionId = button.dataset.questionId;
  const optionKey = button.dataset.optionKey;

  if (!questionId || !optionKey) return;

  state.answers[questionId] = optionKey;

  document.querySelectorAll('.option-btn').forEach((node) => {
    node.setAttribute('disabled', 'disabled');
  });

  button.classList.add('is-selected');

  window.setTimeout(() => {
    nextQuestion();
  }, 320);
}

async function switchLanguage(nextLang) {
  if (!isSupportedLang(nextLang) || nextLang === state.lang) return;
  const previousLang = state.lang;
  const previousPage = state.page;
  setLang(nextLang);

  try {
    await bootstrapLang(nextLang);
    trackEvent('switch_language', buildLanguageParams({
      from: previousLang,
      to: state.lang,
      page: previousPage,
    }));
    // Preserve what the user was doing when possible.
    switch (state.page) {
      case PAGES.LANDING:
        state.landingHook = null;
        renderLanding();
        activatePage(PAGES.LANDING);
        break;
      case PAGES.QUIZ:
        // If the language switched mid-quiz, restart because question set differs.
        startQuiz('language_switch_restart');
        break;
      case PAGES.LOADING:
        // Loading is ephemeral; bounce back to landing.
        showLanding();
        break;
      case PAGES.RESULT:
        if (state.result) {
          // Re-match against the new-language archetype copy so names/descriptions update.
          state.result = matchPersonality({
            answers: state.answers,
            questions: state.data.questions.questions,
            dimensions: state.data.dimensions.dimensions,
            archetypes: state.data.archetypes.archetypes,
            ui: currentUi(),
          });
          renderResult();
          activatePage(PAGES.RESULT);
        } else {
          showLanding();
        }
        break;
      case PAGES.GALLERY:
        renderGallery();
        activatePage(PAGES.GALLERY);
        break;
      default:
        showLanding();
    }
  } catch (error) {
    console.error('Failed to switch language:', error);
  }
}

function onClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  switch (action) {
    case 'start-quiz':
      startQuiz('landing');
      break;
    case 'show-landing':
      showLanding();
      break;
    case 'open-gallery':
      showGallery();
      break;
    case 'show-result':
      showResult();
      break;
    case 'restart-quiz':
      startQuiz('restart');
      break;
    case 'select-option':
      selectOption(target);
      break;
    case 'share-result':
      handleShareAction(shareResult, 'generate_share_image', 'download_image');
      break;
    case 'copy-share-text':
      handleShareAction(copyShareText, 'copy_share_text', 'copy_text');
      break;
    case 'toggle-lang':
      switchLanguage(otherLang(state.lang));
      break;
    default:
      break;
  }
}

async function bootstrapLang(lang) {
  const { questions, dimensions, archetypes, memes, personalityCopy, ui } = await loadLocalizedData(lang);

  state.lang = lang;
  state.data = {
    questions,
    dimensions,
    archetypes: mergeArchetypeCopy(archetypes, personalityCopy),
    memes,
    ui,
  };

  applyLocaleChrome();
}

async function init() {
  try {
    const initialLang = detectLang();
    await bootstrapLang(initialLang);
    renderLanding();
    activatePage(PAGES.LANDING);
    root.addEventListener('click', onClick);
    document.querySelector('.app-header')?.addEventListener('click', onClick);
  } catch (error) {
    console.error(error);
    const ui = currentUi();
    const landingUi = ui?.landing ?? {};
    pages[PAGES.LANDING].innerHTML = `
      <article class="card error-card">
        <p class="eyebrow">${escapeHtml(landingUi.errorEyebrow ?? 'Init failed')}</p>
        <h1>${escapeHtml(landingUi.errorTitle ?? 'BBTI could not tip off.')}</h1>
        <p class="body-copy">${escapeHtml(landingUi.errorBody ?? 'Make sure you are running a local static server.')}</p>
      </article>
    `;
    activatePage(PAGES.LANDING);
  }
}

init();
