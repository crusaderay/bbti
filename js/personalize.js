import { interpolate } from './i18n.js';

function uniqueLines(lines) {
  return Array.from(new Set(lines.filter(Boolean)));
}

export function buildPersonalReadout({ answers, modelScores, archetype, ui }) {
  const personalize = ui?.personalize ?? {};
  const modelHighReads = personalize.modelHighReads ?? {};
  const modelLowReads = personalize.modelLowReads ?? {};
  const answerRoasts = personalize.answerRoasts ?? {};
  const summaryTemplate = personalize.summaryTemplate ?? '';

  const sortedModels = [...modelScores].sort((left, right) => right.average - left.average);
  const topModel = sortedModels[0];
  const secondModel = sortedModels[1];
  const bottomModel = sortedModels[sortedModels.length - 1];

  const summary = interpolate(summaryTemplate, {
    archetypeName: archetype?.name ?? '',
    topLabel: topModel?.label ?? '',
    secondLabel: secondModel?.label ?? '',
    bottomLabel: bottomModel?.label ?? '',
  });

  const keyedRoasts = Object.entries(answers)
    .map(([questionId, optionKey]) => answerRoasts?.[questionId]?.[optionKey])
    .filter(Boolean);

  const bullets = uniqueLines([
    ...keyedRoasts,
    modelHighReads[topModel?.model],
    modelHighReads[secondModel?.model],
    modelLowReads[bottomModel?.model],
  ]).slice(0, 3);

  return {
    summary,
    bullets,
  };
}
