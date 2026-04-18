// BBTI v3 评分器 — 证据驱动混合评分
// 公式：total(A) = w_base * base_similarity(A) + w_sig * signature_bonus(A) - w_conf * conflict_penalty(A)
//       + 彩蛋特判 + BEER 特判 + OJBK 门控 + 距离兜底 → BNCH
//
// 与 v2 的差异：
// - 维度从 15 砍到 5（B/L/F/A/S）
// - 除了"最相似"的 vector 匹配，额外加入签名 / 分流 / 冲突三类证据
// - 为结果页输出每人格的 top-2 证据题（供"铁证"模块使用）

import { buildPersonalReadout } from './personalize.js';

const DIMENSION_ORDER = ['B', 'L', 'F', 'A', 'S'];

const BANDS = {
  1: 'L',
  2: 'M',
  3: 'H',
};

const DEFAULT_WEIGHTS = {
  baseSimilarity: 1.0,
  signatureBonus: 2.0,
  conflictPenalty: 1.5,
  easterThreshold: 5,     // 彩蛋触发门槛：该彩蛋 weight >= 此值才启动特判流程
  fallbackDistance: 8,    // 兜底：最高分和第二名差距太小且 base 距离太大 → BNCH
};

// 把原始分归到 1/2/3 三档（用于雷达图显示与人格 vector 对比）
function getThresholds(questionCount) {
  if (!questionCount || questionCount <= 0) return [2, 4];
  const min = 0;
  const max = questionCount * 3;
  const span = max - min;
  return [min + Math.floor(span / 3), min + Math.floor((span * 2) / 3)];
}

function isGeneralistEligible(userVector, rawScores) {
  // OJBK 触发：没有任何一个维度达到 band 3 —— 典型"都行人"没有极端偏好
  const highCount = userVector.filter((v) => v === 3).length;
  return highCount === 0;
}

// ---- 基础维度分 ----
export function calculateRawScores(questions, answers) {
  const rawScores = {};
  for (const question of questions) {
    const selectedKey = answers[question.id];
    const option = question.options.find((o) => o.key === selectedKey);
    if (!option) continue;
    for (const [dim, score] of Object.entries(option.scores || {})) {
      rawScores[dim] = (rawScores[dim] ?? 0) + score;
    }
  }
  return rawScores;
}

export function buildUserVector(dimensions, rawScores) {
  return dimensions.map((dim) => {
    const raw = rawScores[dim.id] ?? 0;
    const [lowMax, midMax] = getThresholds(dim.questionCount);
    if (raw <= lowMax) return 1;
    if (raw <= midMax) return 2;
    return 3;
  });
}

export function vectorToBandMap(dimensions, vector) {
  return Object.fromEntries(
    dimensions.map((dim, i) => [dim.id, BANDS[vector[i]] ?? 'M']),
  );
}

// ---- 按 5 个维度聚合给雷达图用 ----
export function computeModelScores(dimensions, vector) {
  return dimensions.map((dim, i) => ({
    model: dim.id,
    label: dim.name,
    color: dim.color,
    band: BANDS[vector[i]] ?? 'M',
    average: vector[i],
    percentage: Math.round((vector[i] / 3) * 100),
  }));
}

// ---- 签名 / 分流 / 冲突 分 ----
function collectEvidenceScores(questions, answers) {
  // 返回 {code: {signature, conflict, signatureEvidence: [{qid, optKey, weight, ...}], conflictEvidence: [...]}}
  const byCode = {};
  const easter = [];

  for (const question of questions) {
    const selectedKey = answers[question.id];
    if (!selectedKey) continue;
    const option = question.options.find((o) => o.key === selectedKey);
    if (!option) continue;

    // signatures
    for (const [code, weight] of Object.entries(option.signatures || {})) {
      if (!byCode[code]) byCode[code] = { signature: 0, conflict: 0, signatureEvidence: [], conflictEvidence: [] };
      byCode[code].signature += weight;
      byCode[code].signatureEvidence.push({
        qid: question.id,
        qIndex: question.index,
        qTitle: question.title,
        qText: question.text,
        optKey: selectedKey,
        optText: option.text,
        weight,
        type: question.type,
      });
    }

    // conflicts
    for (const [code, penalty] of Object.entries(option.conflicts || {})) {
      if (!byCode[code]) byCode[code] = { signature: 0, conflict: 0, signatureEvidence: [], conflictEvidence: [] };
      byCode[code].conflict += penalty;
      byCode[code].conflictEvidence.push({
        qid: question.id,
        qIndex: question.index,
        qTitle: question.title,
        qText: question.text,
        optKey: selectedKey,
        optText: option.text,
        penalty,
      });
    }

    // easter: 不再做特判，把 weight 直接加到该 code 的 signature，并记录为 signatureEvidence
    if (option.easter) {
      const code = option.easter.code;
      const weight = option.easter.weight;
      if (!byCode[code]) byCode[code] = { signature: 0, conflict: 0, signatureEvidence: [], conflictEvidence: [] };
      byCode[code].signature += weight;
      byCode[code].signatureEvidence.push({
        qid: question.id,
        qIndex: question.index,
        qTitle: question.title,
        qText: question.text,
        optKey: selectedKey,
        optText: option.text,
        weight,
        type: question.type,
        isEaster: true,
      });
      easter.push({ code, weight, qid: question.id, optKey: selectedKey });
    }
  }

  return { byCode, easter };
}

// ---- 基础相似度 ----
function baseSimilarity(userVector, archetypeVector) {
  // 每维 matching = 3 - |diff|，最大 3，min 可能是 1（diff=2）或 0（极端不匹配，不会发生因为 vector 值 1-3）
  if (!Array.isArray(archetypeVector) || archetypeVector.length !== userVector.length) return 0;
  let sum = 0;
  for (let i = 0; i < userVector.length; i++) {
    sum += Math.max(0, 3 - Math.abs(userVector[i] - archetypeVector[i]));
  }
  return sum; // 0-15
}

function manhattanDistance(userVector, archetypeVector) {
  if (!Array.isArray(archetypeVector)) return Infinity;
  return archetypeVector.reduce((acc, v, i) => acc + Math.abs(v - userVector[i]), 0);
}

// ---- 排序 ----
export function rankArchetypes({
  archetypes,
  userVector,
  evidenceByCode,
  weights = DEFAULT_WEIGHTS,
  rawScores,
}) {
  const generalistEligible = isGeneralistEligible(userVector, rawScores);

  const scored = archetypes
    .filter((a) => !a.isSpecial || a.code === 'OJBK' || a.code === 'BNCH')
    .filter((a) => a.code !== 'OJBK' || generalistEligible)
    .filter((a) => Array.isArray(a.vector5))
    .map((archetype) => {
      const base = baseSimilarity(userVector, archetype.vector5);
      const ev = evidenceByCode[archetype.code] || { signature: 0, conflict: 0, signatureEvidence: [], conflictEvidence: [] };
      const total = weights.baseSimilarity * base
                  + weights.signatureBonus * ev.signature
                  - weights.conflictPenalty * ev.conflict;

      return {
        archetype,
        base,
        signature: ev.signature,
        conflict: ev.conflict,
        total,
        distance: manhattanDistance(userVector, archetype.vector5),
        signatureEvidence: [...ev.signatureEvidence].sort((a, b) => b.weight - a.weight),
        conflictEvidence: [...ev.conflictEvidence].sort((a, b) => b.penalty - a.penalty),
      };
    })
    .sort((a, b) => b.total - a.total);

  return scored;
}

function findArchetype(archetypes, code) {
  return archetypes.find((a) => a.code === code) ?? null;
}

// ---- 结果组装 ----
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
    evidenceForTop,
    questions,
  } = payload;

  const modelScores = computeModelScores(dimensions, userVector);

  return {
    archetype,
    matchedBy,
    note,
    distance,
    rawScores,
    userVector,
    displayVector: Array.isArray(archetype.vector5) ? archetype.vector5 : userVector,
    bandMap: vectorToBandMap(dimensions, userVector),
    modelScores,
    personalReadout: buildPersonalReadout({
      answers,
      modelScores,
      archetype,
      ui,
    }),
    rankedMatches,
    // 新增：铁证模块
    evidence: evidenceForTop,
    // 调试用：备份答题流水
    answers,
    questions,
  };
}

// ---- 入口 ----
export function matchPersonality({ answers, questions, dimensions, archetypes, ui, weightsOverride }) {
  const weights = { ...DEFAULT_WEIGHTS, ...(weightsOverride || {}) };
  const rawScores = calculateRawScores(questions, answers);
  const userVector = buildUserVector(dimensions, rawScores);
  const { byCode: evidenceByCode, easter } = collectEvidenceScores(questions, answers);

  const notes = ui?.result ?? {};

  // 1. BEER 特判（Q17 终极题 D 选项）—— 只有当 F 维真正高（band 3）且签名无更强竞争者时才触发
  const q17Answer = answers.Q17;
  if (q17Answer) {
    const q17 = questions.find((q) => q.id === 'Q17');
    const q17Opt = q17?.options.find((o) => o.key === q17Answer);
    if (q17Opt?.specialResult === 'BEER') {
      const beer = findArchetype(archetypes, 'BEER');
      const fBand = userVector[DIMENSION_ORDER.indexOf('F')];
      // 竞争检测：若其他人格已有超过 BEER 触发阈值的签名分，让位
      const rankedPreview = rankArchetypes({ archetypes, userVector, evidenceByCode, weights, rawScores });
      const topChallenger = rankedPreview[0];
      const challengerTooStrong = topChallenger && topChallenger.signature >= 12;
      if (beer && fBand >= 2 && !challengerTooStrong) {
        return buildResult({
          archetype: beer,
          dimensions, userVector, rawScores, rankedMatches: rankedPreview, answers, questions, ui,
          matchedBy: 'special',
          note: notes.noteHiddenQ17 ?? notes.noteHiddenFinale ?? '',
          evidenceForTop: buildEvidenceForTop(beer, evidenceByCode, questions, answers),
        });
      }
    }
  }

  // 2. 常规：排序所有人格（彩蛋已通过 signature 参与常规评分，无需特判）
  const rankedMatches = rankArchetypes({ archetypes, userVector, evidenceByCode, weights, rawScores });
  const top = rankedMatches[0];

  // 3. 兜底：BNCH（板凳匪徒）触发条件：
  //    a) 冷淡型：top.total ≤ 12 且签名 ≤ 3（几乎没答对人格）
  //    b) 完全无明显赢家：top.total < 25、签名 ≤ 6、且与 runner-up 分差 < 3
  const runnerUp = rankedMatches[1];
  const topMargin = top && runnerUp ? top.total - runnerUp.total : 99;
  const triggerA = top && top.total <= 12 && top.signature <= 3;
  const triggerB = top && top.total < 25 && top.signature <= 6 && topMargin < 3;
  if (!top || triggerA || triggerB) {
    const bnch = findArchetype(archetypes, 'BNCH');
    if (bnch) {
      return buildResult({
        archetype: bnch,
        dimensions, userVector, rawScores, rankedMatches: rankedMatches || [], answers, questions, ui,
        matchedBy: 'fallback',
        note: notes.noteFallbackDistance ?? '',
        evidenceForTop: buildEvidenceForTop(bnch, evidenceByCode, questions, answers),
      });
    }
  }

  return buildResult({
    archetype: top.archetype,
    dimensions, userVector, rawScores, rankedMatches, answers, questions, ui,
    matchedBy: 'hybrid',
    distance: top.distance,
    evidenceForTop: buildEvidenceForTop(top.archetype, evidenceByCode, questions, answers),
  });
}

// ---- 铁证模块：为结果页生成 top-2 证据题 + "为什么不是 X" ----
function buildEvidenceForTop(archetype, evidenceByCode, questions, answers) {
  const ev = evidenceByCode[archetype.code] || { signatureEvidence: [], conflictEvidence: [] };
  const signatures = ev.signatureEvidence || [];

  // 优先选签名题 type=signature/finale 的，再选基础题
  const priority = (e) => {
    if (e.type === 'signature' || e.type === 'finale') return 0;
    return 1;
  };
  const sorted = [...signatures].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return b.weight - a.weight;
  });

  const primary = sorted[0] || null;
  const secondary = sorted.find((e, i) => i > 0 && e.qid !== primary?.qid) || null;

  // 为什么不是 X：取 archetype.rivals 里第一个，再给一条对比证据
  const rivals = archetype.rivals || [];
  const contrast = archetype.contrast || {};
  const rivalPick = rivals[0]
    ? {
        code: rivals[0],
        copy: contrast[rivals[0]] || '',
      }
    : null;

  return { primary, secondary, rival: rivalPick };
}
