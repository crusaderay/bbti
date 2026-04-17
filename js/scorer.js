import { buildPersonalReadout } from './personalize.js';

const DIMENSION_ORDER = ['B1', 'B2', 'B3', 'L1', 'L2', 'L3', 'F1', 'F2', 'F3', 'A1', 'A2', 'A3', 'S1', 'S2', 'S3'];

const BANDS = {
  1: 'L',
  2: 'M',
  3: 'H',
};

const THRESHOLDS = {
  2: [3, 4],
  3: [4, 6],
  4: [6, 9],
  5: [8, 11],
};

function getThresholds(questionCount) {
  if (THRESHOLDS[questionCount]) {
    return THRESHOLDS[questionCount];
  }

  const min = questionCount;
  const span = questionCount * 2;
  const lowMax = min + Math.floor(span / 3);
  const midMax = min + Math.floor((span * 2) / 3);
  return [lowMax, midMax];
}

function isGeneralistEligible(userVector) {
  const counts = userVector.reduce(
    (accumulator, value) => {
      accumulator[value] = (accumulator[value] ?? 0) + 1;
      return accumulator;
    },
    { 1: 0, 2: 0, 3: 0 },
  );

  return counts[2] >= 10 && counts[1] <= 3 && counts[3] <= 3;
}

export function calculateRawScores(questions, answers) {
  const rawScores = {};

  for (const question of questions) {
    const selectedKey = answers[question.id];
    const option = question.options.find((entry) => entry.key === selectedKey);

    if (!option) continue;

    for (const [dimensionId, score] of Object.entries(option.scores)) {
      rawScores[dimensionId] = (rawScores[dimensionId] ?? 0) + score;
    }
  }

  return rawScores;
}

export function buildUserVector(dimensions, rawScores) {
  return dimensions.map((dimension) => {
    const raw = rawScores[dimension.id] ?? 0;
    const [lowMax, midMax] = getThresholds(dimension.questionCount);

    if (raw <= lowMax) return 1;
    if (raw <= midMax) return 2;
    return 3;
  });
}

export function vectorToBandMap(dimensions, vector) {
  return Object.fromEntries(
    dimensions.map((dimension, index) => [dimension.id, BANDS[vector[index]] ?? 'M']),
  );
}

export function computeModelScores(dimensions, vector) {
  const models = new Map();

  dimensions.forEach((dimension, index) => {
    const current = models.get(dimension.model) ?? {
      model: dimension.model,
      label: dimension.modelName,
      total: 0,
      count: 0,
    };

    current.total += vector[index];
    current.count += 1;
    models.set(dimension.model, current);
  });

  return Array.from(models.values()).map((entry) => ({
    model: entry.model,
    label: entry.label,
    average: Number((entry.total / entry.count).toFixed(2)),
    percentage: Math.round(((entry.total / (entry.count * 3)) * 100)),
  }));
}

export function rankArchetypes(archetypes, userVector) {
  const generalistEligible = isGeneralistEligible(userVector);

  return archetypes
    .filter((archetype) => Array.isArray(archetype.vector) && !archetype.isSpecial)
    .filter((archetype) => archetype.code !== 'OJBK' || generalistEligible)
    .map((archetype) => ({
      archetype,
      distance: archetype.vector.reduce(
        (sum, value, index) => sum + Math.abs(value - userVector[index]),
        0,
      ),
    }))
    .sort((left, right) => left.distance - right.distance);
}

function findArchetype(archetypes, code) {
  return archetypes.find((archetype) => archetype.code === code) ?? null;
}

function buildResult(payload) {
  const {
    archetype,
    dimensions,
    userVector,
    rawScores,
    rankedMatches,
    answers,
    matchedBy,
    distance = null,
    note = '',
    ui = null,
  } = payload;

  const modelScores = computeModelScores(dimensions, userVector);

  return {
    archetype,
    matchedBy,
    note,
    distance,
    rawScores,
    userVector,
    displayVector: Array.isArray(archetype.vector) ? archetype.vector : userVector,
    bandMap: vectorToBandMap(dimensions, userVector),
    modelScores,
    personalReadout: buildPersonalReadout({
      answers,
      modelScores,
      archetype,
      ui,
    }),
    rankedMatches,
  };
}

function buildResultWithUi(payload, ui) {
  return buildResult({ ...payload, ui });
}

export function matchPersonality({ answers, questions, dimensions, archetypes, ui }) {
  const rawScores = calculateRawScores(questions, answers);
  const userVector = buildUserVector(dimensions, rawScores);
  const rankedMatches = rankArchetypes(archetypes, userVector);
  const fallbackArchetype = findArchetype(archetypes, 'BNCH');
  const beerArchetype = findArchetype(archetypes, 'BEER');
  const fireIndex = DIMENSION_ORDER.indexOf('F1');
  const notes = ui?.result ?? {};

  if (answers.Q25 === 'D' && beerArchetype && userVector[fireIndex] >= 2) {
    return buildResultWithUi({
      archetype: beerArchetype,
      dimensions,
      userVector,
      rawScores,
      rankedMatches,
      answers,
      matchedBy: 'special',
      note: notes.noteHiddenQ25 ?? '',
    }, ui);
  }

  const bestMatch = rankedMatches[0];

  if (!bestMatch && fallbackArchetype) {
    return buildResultWithUi({
      archetype: fallbackArchetype,
      dimensions,
      userVector,
      rawScores,
      rankedMatches: [],
      answers,
      matchedBy: 'fallback',
      note: notes.noteFallbackEmpty ?? '',
    }, ui);
  }

  if (bestMatch.distance > 18 && fallbackArchetype) {
    return buildResultWithUi({
      archetype: fallbackArchetype,
      dimensions,
      userVector,
      rawScores,
      rankedMatches,
      answers,
      matchedBy: 'fallback',
      distance: bestMatch.distance,
      note: notes.noteFallbackDistance ?? '',
    }, ui);
  }

  return buildResultWithUi({
    archetype: bestMatch.archetype,
    dimensions,
    userVector,
    rawScores,
    rankedMatches,
    answers,
    matchedBy: 'distance',
    distance: bestMatch.distance,
  }, ui);
}
