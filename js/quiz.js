import { interpolate } from './i18n.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderOptionMeta(option) {
  if (!option.effect) return '';
  return `<span class="option-meta">${escapeHtml(option.effect)}</span>`;
}

export function renderQuestionView({ question, index, total, ui, locked = false }) {
  const progress = ((index + 1) / total) * 100;
  const quizUi = ui?.quiz ?? {};
  const progressCopy = interpolate(quizUi.progressCopyTemplate ?? '', { total, index: index + 1 });
  const questionEyebrow = interpolate(quizUi.questionEyebrowTemplate ?? '', { index: index + 1, total });

  return `
    <div class="quiz-layout">
      <aside class="quiz-sidebar card">
        <p class="eyebrow">${escapeHtml(quizUi.progressEyebrow ?? '')}</p>
        <div class="quiz-progress">
          <div class="quiz-progress__track">
            <div class="quiz-progress__bar" style="width: ${progress}%"></div>
          </div>
          <strong>${index + 1} / ${total}</strong>
        </div>
        <p class="quiz-progress__copy">${escapeHtml(progressCopy)}</p>
        <div class="quiz-tags">
          <span>${escapeHtml(question.id)}</span>
          <span>${escapeHtml(question.title)}</span>
        </div>
      </aside>

      <article class="question-card card" data-question-card>
        <p class="eyebrow">${escapeHtml(questionEyebrow)}</p>
        <h1 class="question-card__title">${escapeHtml(question.text)}</h1>
        <div class="option-list" role="list">
          ${question.options
            .map(
              (option) => `
                <button
                  class="option-btn"
                  type="button"
                  data-action="select-option"
                  data-question-id="${escapeHtml(question.id)}"
                  data-option-key="${escapeHtml(option.key)}"
                  ${locked ? 'disabled' : ''}
                >
                  <span class="option-btn__key">${escapeHtml(option.key)}</span>
                  <span class="option-btn__body">
                    <span class="option-btn__text">${escapeHtml(option.text)}</span>
                    ${renderOptionMeta(option)}
                  </span>
                </button>
              `,
            )
            .join('')}
        </div>
      </article>
    </div>
  `;
}
