#!/usr/bin/env node
/**
 * BBTI v3 冒烟测试
 *
 * 对每个人格构造"理想答题路径"：每题选择签名权重最高的选项（若无，选基础分最高）
 * 然后跑 scorer，验证 top-1 命中。
 *
 * 同时测试：
 *   - BEER 特判（Q17=D）
 *   - OJBK 门控（全中档答案）
 *   - BNCH 兜底（跳过所有题 / 极端冲突答案）
 */

import { readFileSync } from 'node:fs';
import { matchPersonality } from '../js/scorer.js';

// ---- 加载数据 ----
const questions = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url))).questions;
const archetypes = JSON.parse(readFileSync(new URL('../data/archetypes.json', import.meta.url))).archetypes;
const dimensions = JSON.parse(readFileSync(new URL('../data/dimensions.json', import.meta.url))).dimensions;
// ui 可选，测试用空对象
const ui = {};

// ---- 为每个人格构造理想答题路径 ----
// 评分规则（选每题最优选项）：
//   selfSig * 3 + easterSelf * 3 + baseMatch - otherSig - easterOther - conflictSelf * 2
// 即：优先匹配自身签名 / 彩蛋 / 向量，同时避开给对手加分的选项
function idealAnswersFor(code) {
  const arch = archetypes.find((a) => a.code === code);
  const dimNames = ['B', 'L', 'F', 'A', 'S'];
  const answers = {};

  for (const q of questions) {
    const optScores = q.options.map((o) => {
      const selfSig = (o.signatures && o.signatures[code]) || 0;
      const easterSelf = (o.easter && o.easter.code === code) ? o.easter.weight : 0;
      const conflictSelf = (o.conflicts && o.conflicts[code]) || 0;
      const otherSig = Object.entries(o.signatures || {})
        .filter(([c]) => c !== code)
        .reduce((s, [, w]) => s + w, 0);
      const easterOther = (o.easter && o.easter.code !== code) ? o.easter.weight : 0;
      // 特判陷阱：Q17 D 选项会触发 BEER 特判，其他人格的理想路径绝不应该踩
      const specialTrap = (o.specialResult && o.specialResult !== code) ? 999 : 0;

      // Base match：option.scores 向量跟 archetype.vector5 的目标 band 的契合度
      let baseMatch = 0;
      if (arch?.vector5) {
        for (const [dim, score] of Object.entries(o.scores || {})) {
          const idx = dimNames.indexOf(dim);
          if (idx < 0) continue;
          const target = arch.vector5[idx];
          if (target === 3) baseMatch += (score - 1) * 0.8;  // 目标高 band，偏好 score 大的
          else if (target === 1) baseMatch += (3 - score) * 0.8;  // 目标低 band，偏好 score 小的
          else baseMatch += (score === 2 ? 0.4 : 0.2);  // 目标 mid
        }
      }

      return {
        opt: o,
        // otherSig 权重设为 2.5：用户有理性时不会故意去踩别人的签名
        score: selfSig * 3 + easterSelf * 3 + baseMatch - otherSig * 2.5 - easterOther * 2 - conflictSelf * 2 - specialTrap,
      };
    });
    optScores.sort((a, b) => b.score - a.score);
    answers[q.id] = optScores[0].opt.key;
  }
  return answers;
}

// ---- 跑测试 ----
function runOne(label, answers, expectedCode, { allowTop2 = false } = {}) {
  const result = matchPersonality({ answers, questions, dimensions, archetypes, ui });
  const top1 = result.archetype.code;
  const top3 = (result.rankedMatches || []).slice(0, 3).map((m) => `${m.archetype.code}(${m.total.toFixed(1)})`);
  const pass = top1 === expectedCode || (allowTop2 && (result.rankedMatches || []).slice(0, 2).some((m) => m.archetype.code === expectedCode));
  const sigCount = Object.keys(answers).length;
  const status = pass ? '✅' : '❌';
  console.log(`${status} ${label.padEnd(40)} → ${top1.padEnd(5)} ${pass ? '' : `(expected ${expectedCode})`} | top3: ${top3.join(', ')}`);
  return pass;
}

console.log('\n=== 27 人格理想路径冒烟测试 ===\n');

const results = [];
const testableArchetypes = archetypes.filter((a) => a.vector5 || a.code === 'BEER');
// BEER / BNCH 单独测
const standardArchetypes = testableArchetypes.filter((a) => a.code !== 'BEER' && a.code !== 'BNCH');

for (const a of standardArchetypes) {
  const answers = idealAnswersFor(a.code);
  // 所有人格理想路径必须严格 top1。不再维护 hardCases 白名单——
  // 原先用它护着的 3PTR/MEDI/POLO/58 已经在 Phase 1-2 的签名载体增压后真正 top1。
  // 未来若某个人格卡在 top2，答案是补签名载体或改题面，不是加豁免。
  const hardCases = [];
  const allowTop2 = hardCases.includes(a.code);
  results.push(runOne(`${a.code} ${a.name}`, answers, a.code, { allowTop2 }));
}

// BEER 特判：F 高 + 无任何强签名 + Q17=D
console.log('\n=== BEER 特判测试 ===');
{
  // 构造 F 中等偏高但零明显签名的用户（保证 challenger.signature < 12）
  const answers = {};
  for (const q of questions) {
    let best = q.options[0], bestScore = -Infinity;
    for (const o of q.options) {
      if (o.specialResult) continue;
      const fScore = (o.scores?.F) || 0;
      // 强烈惩罚任何签名（权重 10），保证 BEER 不被签名人格挤掉
      const sigTotal = Object.values(o.signatures || {}).reduce((s, w) => s + w, 0);
      const easterW = o.easter ? o.easter.weight : 0;
      const score = fScore - sigTotal * 10 - easterW * 10;
      if (score > bestScore) { bestScore = score; best = o; }
    }
    answers[q.id] = best.key;
  }
  answers.Q17 = 'D';
  results.push(runOne('BEER via Q17=D + F高 + 无强签名', answers, 'BEER'));
}

// OJBK 门控测试：用户 vector 真正均衡到 [2,2,2,2,2]
console.log('\n=== OJBK 门控测试 ===');
{
  // 用 idealAnswersFor('OJBK') — OJBK 有签名 Q10E/Q14E/Q17A，vector [2,2,2,2,2]
  const answers = idealAnswersFor('OJBK');
  results.push(runOne('OJBK via ideal path', answers, 'OJBK', { allowTop2: true }));
}

// BNCH 兜底测试：用户完全放弃答题（空答案）→ 必 BNCH
// 注：不再测"每题选零签名选项"——因为那种画像产品上应匹配 HYPE（跟风型），不是 BNCH（退场型）
console.log('\n=== BNCH 兜底测试 ===');
{
  const result = matchPersonality({ answers: {}, questions, dimensions, archetypes, ui });
  const pass = result.archetype.code === 'BNCH' && result.matchedBy === 'fallback';
  console.log(`${pass ? '✅' : '❌'} ${'空答案 → BNCH fallback'.padEnd(40)} → ${result.archetype.code.padEnd(5)} ${pass ? '' : `(expected BNCH/fallback)`}`);
  results.push(pass);
}

// ---- 证据模块测试 ----
console.log('\n=== 铁证模块测试 ===');
{
  const answers = idealAnswersFor('FIRE');
  const result = matchPersonality({ answers, questions, dimensions, archetypes, ui });
  const ev = result.evidence;
  const pass = result.archetype.code === 'FIRE' && ev?.primary && ev?.rival;
  console.log(`${pass ? '✅' : '❌'} FIRE evidence structure: primary=${ev?.primary?.qid} (${ev?.primary?.optKey}), secondary=${ev?.secondary?.qid}, rival=${ev?.rival?.code}`);
  if (ev?.rival) {
    console.log(`    rival copy: "${ev.rival.copy}"`);
  }
  results.push(pass);
}

// ---- 汇总 ----
const total = results.length;
const passed = results.filter(Boolean).length;
console.log(`\n=== 汇总: ${passed}/${total} 通过 ===\n`);

if (passed < total) {
  process.exit(1);
}
