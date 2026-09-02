// deck-check.mjs — 캐러셀 회차의 입력·출력·역할 라벨을 대조한다. (2026-08-21 신설)
//
// 왜 만들었나:
//   2026-08-21에 `out/*/slides.json`이 0건인 걸 보고 **"카드 원문이 어디에도 없다"**고
//   판정했다. 틀렸다. 회차별 입력은 `<slug>.json`으로 24건 전량 있었고, 검색 범위가
//   `out/` 하위였을 뿐이다. 「공백을 사실로 읽는다」 계열의 3번째 사례였다.
//   → 사람이 눈으로 세지 않게, 대조를 코드로 고정한다.
//
// 무엇을 보나:
//   ① 입력(<slug>.json) ↔ 출력(out/<slug>/slide-01.png) 대응 — 한쪽만 있으면 잡는다
//   ② 카드 타입 분포 (type)
//   ③ 역할 라벨 커버리지 (deck-roles.json) — 길이 불일치·누락 회차
//   ④ 역할 분포와 「없는 역할」
//
// ★ 게이트 범위를 좁게 잡았다:
//   대응 불일치와 역할 길이 불일치만 exit 1. **역할 배분은 판정하지 않는다** —
//   어떤 배분이 좋은지 실측된 바가 없고, 근거 없는 규격을 강제하면 그게 굳는다.
//   (릴스 훅은 승자 2편 실측이 있어서 게이트로 만들었다. 여기는 그게 없다.)
//
// 사용: node deck-check.mjs
//       node deck-check.mjs --roles     역할 분포까지 자세히

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const ROLES_PATH = path.join(HERE, 'deck-roles.json');
const wantRoles = process.argv.includes('--roles');

// ── 입력: slides 배열을 가진 <slug>.json ─────────────────────────────
const decks = new Map();
for (const f of readdirSync(HERE).filter((f) => f.endsWith('.json'))) {
  let data;
  try { data = JSON.parse(readFileSync(path.join(HERE, f), 'utf8')); } catch { continue; }
  if (!Array.isArray(data?.slides)) continue;
  const slug = f.replace(/\.json$/, '');
  decks.set(slug, {
    types: data.slides.map((s) => s.type ?? 'content'),
    // ★ day-0은 파일명이 slides.json이고 meta.outDir로 실제 폴더를 가리킨다.
    outDir: data.meta?.outDir ? path.basename(data.meta.outDir.replace(/\/+$/, '')) : slug,
  });
}

// ── 출력: slide-01.png이 있는 폴더 ───────────────────────────────────
const rendered = new Set(
  existsSync(OUT)
    ? readdirSync(OUT).filter((d) => existsSync(path.join(OUT, d, 'slide-01.png')))
    : [],
);

// ── 역할 라벨 ────────────────────────────────────────────────────────
let roles = {};
if (existsSync(ROLES_PATH)) {
  try { roles = JSON.parse(readFileSync(ROLES_PATH, 'utf8')).decks ?? {}; }
  catch (e) { console.error(`⛔ deck-roles.json 파싱 실패: ${e.message}`); process.exit(1); }
} else {
  console.error(`⚠️ ${path.basename(ROLES_PATH)} 없음 — 역할 검사를 건너뛴다`);
}

// ── 대조 ─────────────────────────────────────────────────────────────
const problems = [];
const typeCount = new Map();
const roleCount = new Map();
const rows = [];

for (const [slug, d] of [...decks].sort()) {
  d.types.forEach((t) => typeCount.set(t, (typeCount.get(t) ?? 0) + 1));

  const hasPng = rendered.has(d.outDir);
  const r = roles[slug];
  let roleMark;
  if (!r) { roleMark = '⛔ 역할 없음'; problems.push(`${slug}: deck-roles.json에 항목 없음`); }
  else if (r.length !== d.types.length) {
    roleMark = `⛔ ${r.length}≠${d.types.length}`;
    problems.push(`${slug}: 역할 ${r.length}개 vs 카드 ${d.types.length}장 — 길이 불일치`);
  } else {
    roleMark = '있음';
    r.forEach((x) => roleCount.set(x, (roleCount.get(x) ?? 0) + 1));
  }

  if (!hasPng) problems.push(`${slug}: 입력은 있는데 렌더 결과(out/${d.outDir}/slide-01.png)가 없음`);
  rows.push([slug, String(d.types.length), hasPng ? '있음' : '⛔ 없음', roleMark, d.outDir]);
}

for (const dir of [...rendered].sort()) {
  if (![...decks.values()].some((d) => d.outDir === dir)) {
    problems.push(`out/${dir}: PNG는 있는데 입력 <slug>.json이 없음`);
  }
}

// ── 출력 ─────────────────────────────────────────────────────────────
const W = [Math.max(8, ...rows.map((r) => r[0].length)), 4, 8, 12];
console.log(`회차 ${decks.size}개 · 렌더된 세트 ${rendered.size}개 · 총 카드 ${[...typeCount.values()].reduce((a, b) => a + b, 0)}장\n`);
console.log(`${'회차'.padEnd(W[0])}  장수  PNG       역할`);
console.log('-'.repeat(W[0] + 30));
for (const [slug, n, png, role, outDir] of rows) {
  const tail = outDir !== slug ? `  (out/${outDir})` : '';
  console.log(`${slug.padEnd(W[0])}  ${n.padStart(3)}   ${png.padEnd(8)}  ${role}${tail}`);
}

const total = [...typeCount.values()].reduce((a, b) => a + b, 0);
console.log('\n카드 타입 분포');
for (const [t, n] of [...typeCount].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(9)} ${String(n).padStart(3)}장  ${(n / total * 100).toFixed(1)}%`);
}

if (wantRoles && roleCount.size) {
  const rTotal = [...roleCount.values()].reduce((a, b) => a + b, 0);
  console.log('\n역할 분포');
  for (const [r, n] of [...roleCount].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r.padEnd(10)} ${String(n).padStart(3)}장  ${(n / rTotal * 100).toFixed(1)}%`);
  }
  const known = Object.keys(JSON.parse(readFileSync(ROLES_PATH, 'utf8'))._역할어휘 ?? {});
  const unused = known.filter((k) => !roleCount.has(k));
  if (unused.length) console.log(`\n한 번도 안 쓴 역할: ${unused.join(' ')}`);
  const rare = [...roleCount].filter(([, n]) => n <= 2).map(([r, n]) => `${r}(${n})`);
  if (rare.length) console.log(`2장 이하로만 쓴 역할: ${rare.join(' ')}`);
}

if (problems.length) {
  console.error(`\n⛔ 문제 ${problems.length}건`);
  problems.forEach((p) => console.error(`  · ${p}`));
  process.exitCode = 1;
} else {
  console.log('\n✅ 입력↔출력 대응·역할 라벨 이상 없음');
}
