// alt-coverage.mjs — 카드뉴스 대체 텍스트(alt)가 몇 장이나 자동으로 만들어지는지 센다.
//
// 사용법: node alt-coverage.mjs
//
// ★ 왜 만들었나 (2026-08-21)
//   "94%가 자동"이라는 숫자를 릴스에 띄우려는데, 그걸 뽑는 명령이 없었다.
//   화면에 없는 명령을 띄우지 않기로 했으므로 실제로 도는 스크립트를 만든다.
//   alt.mjs 의 규칙: 슬라이드에 alt 가 있으면 그걸 쓰고, 없으면 kicker+heading 으로 만든다.
//   즉 수동 alt 개수 = 자동 규칙으로는 부족하다고 판단해 사람이 손댄 카드 수다.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let files = 0, total = 0, manual = 0;
const byType = {};

for (const f of readdirSync(HERE).filter((x) => x.endsWith('.json'))) {
  let s;
  try { s = JSON.parse(readFileSync(join(HERE, f), 'utf8')); } catch { continue; }
  if (!Array.isArray(s.slides)) continue;
  files++;
  for (const slide of s.slides) {
    total++;
    byType[slide.type] ??= { total: 0, manual: 0 };
    byType[slide.type].total++;
    if (slide.alt) { manual++; byType[slide.type].manual++; }
  }
}

const auto = total - manual;
const pct = ((auto / total) * 100).toFixed(1);

console.log(`카드뉴스 회차      ${files}`);
console.log(`전체 슬라이드      ${total} 장`);
console.log(`코드가 쓴 alt      ${auto} 장  (${pct}%)`);
console.log(`손으로 쓴 alt      ${manual} 장`);
console.log('');
console.log('타입별 (수동 / 전체)');
for (const [t, v] of Object.entries(byType).sort((a, b) => b[1].total - a[1].total)) {
  const mark = v.manual === v.total && v.total > 0 ? '  <- 전부 수동' : '';
  console.log(`  ${t.padEnd(10)} ${String(v.manual).padStart(3)} / ${String(v.total).padStart(3)}${mark}`);
}
