// lint-claims.mjs — 「쓰면 안 되는 숫자」 대장을 볼트에서 생성한다. 2026-08-24 신설.
//
// 왜 만들었나:
//   볼트는 미검증 수치를 `[미검증]`·`[미측정]`·`[확인 필요]` 같은 마커로 **문장 안에**만
//   표시해왔다. 2026-08-24 실측: 마커 421건, **마커와 숫자가 같은 줄에 있는 경우 373건.**
//   281개 페이지에 흩어져 있어서 **새 세션이 그 숫자를 모르고 인용할 수 있다.**
//   `solo-skills/naver-blog-post`가 「쓰면 안 되는 카더라 수치」를 별도 파일로 두는 걸 보고 채택했다.
//
// ★ 손으로 쓰지 않는다. 손으로 쓴 목록은 낡고, 낡은 목록은 안 보게 되고,
//   안 보는 목록은 없는 것과 같다. **볼트가 대장이고 이 스크립트는 그걸 비춘다.**
//
// 하는 일: **대장 생성 하나뿐이다.** wiki 전체에서 마커 주변의 숫자를 긁어 페이지별로 모은다.
//
// ⛔⛔ **발행 원고 자동 대조는 만들었다가 잘라냈다 (2026-08-24).**
//   원고의 숫자가 이 대장에 있으면 경고하는 검사를 붙였는데 **오탐이 압도적이었다.**
//   1차: N건 중 거의 전부 오탐 → index.md 제외 + 마커 근접 조건(60자)으로 M건까지 줄였으나
//   남은 것도 `2026`(연도) · `100`·`500`(라운드 넘버) · **`<실측 도달값>`(우리 실측 도달값)** 였다.
//
//   ★★ 잘라낸 진짜 이유는 정확도가 아니라 **추론 자체가 틀렸다는 것**이다:
//   **우리 마커는 「숫자」가 아니라 「주장」에 붙는다.** <성과 기록 문서>의
//   *"도달이 <실측 도달값>이라 CTA 문제인지 노출 부족인지 분리가 안 된다 [미검증]"* 에서 미검증인 것은
//   **<실측 도달값>가 아니라 그 해석**이다. 그러니 "마커 근처의 숫자 = 미검증 숫자"는 성립하지 않는다.
//
//   → 「신호를 믿으면 안 되는 자리」 처방 4단계 ⑤ **거짓 경보를 내는 검사는 무시된다.**
//     무시될 게이트를 남기는 것보다 **읽히는 대장 하나**가 낫다. 판단은 사람이 문장을 읽고 한다.
//   📌 숫자 단위 게이트를 원하면 **마커 규약을 바꿔야 한다** — 숫자에 직접 붙이는 형태
//     (예: `<실측 도달값>[미검증]`). 그건 볼트 전체 표기 변경이라 사용자 결정 사항이다.
//
// 사용: node pipeline/vault/lint-claims.mjs          # 보고만
//       node pipeline/vault/lint-claims.mjs --write  # 위키 페이지의 자동 생성 구간 갱신

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// ★ 볼트 경로를 바꿔 낄 수 있다 (2026-08-26). lint-links.mjs 와 같은 규칙이다.
//   ⛔ 두 곳이 갈리면 같은 볼트를 두 도구가 다르게 본다.
const vi = process.argv.indexOf('--vault');
const VAULT = vi >= 0 && process.argv[vi + 1]
  ? path.resolve(process.cwd(), process.argv[vi + 1])
  : path.join(ROOT, 'second-brain');
const WIKI = path.join(VAULT, 'wiki');

// ⛔ lint-links.mjs 와 같은 이유 — 없는 경로에 조용히 빈 리포트를 내지 않는다 (2026-08-26).
if (!existsSync(WIKI)) {
  console.error(`⛔ wiki 폴더가 없다: ${WIKI}`);
  console.error(`   --vault <볼트경로> 로 지정한다. 볼트 안에 wiki/ 가 있어야 한다.`);
  process.exit(1);
}

// ⚠️ --write 로 갱신할 대상 페이지. 우리 볼트의 페이지 이름이다.
//   --write 없이 돌리면 쓰이지 않는다(검사만 한다). 다른 볼트에서 --write 를 쓰려면
//   이 이름의 페이지에 AUTO:START/END 표시를 두거나 이 줄을 바꾼다 — 136행이 그때 명확히 멈춘다.
const TARGET = path.join(WIKI, 'topics', '쓰면 안 되는 숫자.md');

// log.md 는 제외한다 — append-only 이력이라 그 안의 마커는 **당시 상태의 기록**이고
// 지금 살아 있는 주장이 아니다. lint-report.md 도 생성물이라 제외.
// ⚠️⚠️ index.md 도 제외한다 (2026-08-24 1차 실행에서 거짓 경보를 내고 고친 자리).
//   index.md 한 줄은 페이지 요약이라 수천 자에 마커와 숫자가 여러 개 섞여 있다.
//   그래서 **그 줄의 모든 숫자**가 미검증으로 등록되고, 우리 검증된 실측(도달 178·89배)까지
//   대장에 올라와 발행 원고와 겹쳤다 — N건 중 거의 전부 오탐이었다.
//   주장은 **실제 페이지**에 있고 index 는 그걸 가리키는 목록일 뿐이다.
const SKIP_FILES = new Set(['log.md', 'lint-report.md', 'index.md', '쓰면 안 되는 숫자.md']);

// ★ 근접 조건 — 숫자가 마커와 **같은 줄에 있다**는 것만으로는 부족하다.
//   마커는 줄 안의 특정 주장에 붙은 것이고, 같은 줄의 다른 숫자까지 미검증인 건 아니다.
//   마커 위치에서 앞뒤 이 범위 안의 숫자만 그 마커에 걸린 것으로 본다.
const NEAR = 60;

// ★ 마커 목록·②형 정규식은 `claim-markers.mjs` 가 단일 출처다 (2026-08-24 규약 확정).
//   여기에 목록을 복사해두면 규약이 갈라진다 — 실제로 그 계열의 사고를 여러 번 겪었다.
import { MARKERS, ANY_MARKER, MARKED_NUMBER, BLOCKING, isDistinctive } from './claim-markers.mjs';
const MARKER_RE = ANY_MARKER;

// ★ 변별력 있는 숫자만 본다. "3"·"10" 은 어디에나 나와서 대조에 쓸 수 없다.
//   기준: 3자리 이상 · 소수점 포함 · 단위가 붙은 2자리 이상.
const DISTINCT_NUM = /(?<![\d.,])(\d[\d,]{2,}(?:\.\d+)?|\d+\.\d+|\d{2,}\s?(?:%|만|억|원|배|명|건|편|일|개|시간|분|초|KB|MB|GB))/g;

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith('.md') && !SKIP_FILES.has(e)) out.push(p);
  }
  return out;
}

// ── ① 대장 수집 ──
const claims = [];          // {page, folder, marker, numbers[], text}
for (const f of walk(WIKI)) {
  const rel = path.relative(WIKI, f).replace(/\\/g, '/');
  const folder = rel.includes('/') ? rel.split('/').slice(0, -1).join('/') : '(루트)';
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    MARKER_RE.lastIndex = 0;
    const mHits = [...line.matchAll(MARKER_RE)];
    if (!mHits.length) return;
    // ★ 마커 주변 NEAR 자 안의 숫자만 그 마커에 걸린 것으로 본다.
    const nums = new Set();
    for (const m of line.matchAll(DISTINCT_NUM)) {
      const at = m.index ?? 0;
      if (mHits.some((h) => Math.abs((h.index ?? 0) - at) <= NEAR)) nums.add(m[1].trim());
    }
    if (!nums.size) return;
    // 문장도 마커 주변만 남긴다 — 거대한 줄 전체를 근거로 보여주면 읽을 수 없다.
    // ⚠️ 자르다가 위키링크가 반토막 나면 **없는 페이지를 가리키는 깨진 링크**가 생긴다
    //    (2026-08-24 1차 생성에서 `[[<수집 문서>
    //    발췌는 참조가 아니므로 대괄호를 걷어낸다 — 출처는 옆 칸의 페이지 링크가 담당한다.
    const c0 = Math.max(0, (mHits[0].index ?? 0) - NEAR);
    claims.push({
      page: path.basename(rel, '.md'), folder, line: i + 1,
      markers: [...new Set(mHits.map((h) => h[1]))], numbers: [...nums],
      text: ((c0 > 0 ? '…' : '') + line.slice(c0, (mHits.at(-1).index ?? 0) + NEAR))
        .replace(/\[\[|\]\]/g, '')          // 반토막 위키링크 방지
        .replace(/^[\s>|*#-]+/, '').trim(),
    });
  });
}

// ── 출력 ──
const byMarker = {};
for (const c of claims) for (const m of c.markers) byMarker[m] = (byMarker[m] || 0) + 1;
const byFolder = {};
for (const c of claims) byFolder[c.folder] = (byFolder[c.folder] || 0) + 1;

console.log(`쓰면 안 되는 숫자 — 대장 ${claims.length}건 (마커+변별력 있는 숫자가 같은 줄)`);
console.log(`  마커별: ${Object.entries(byMarker).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  폴더별: ${Object.entries(byFolder).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
// ── ②형(숫자 바로 뒤) 집계 — 이건 사람이 이미 판단해 옮긴 것이라 기계가 지킬 수 있다 ──
const marked = [];
for (const f of walk(WIKI)) {
  const page = path.basename(f, '.md');
  for (const m of readFileSync(f, 'utf8').matchAll(MARKED_NUMBER)) {
    marked.push({ page, raw: m[1].trim(), marker: m[2], hard: BLOCKING.has(m[2]) && isDistinctive(m[1].trim()) });
  }
}
console.log(`\n② 표기(숫자 바로 뒤·공백 없음) ${marked.length}건 — 그중 게이트가 막는 것 ${marked.filter((x) => x.hard).length}건`);
for (const x of marked) {
  console.log(`   ${x.hard ? '⛔' : '⚠️'} ${x.raw}[${x.marker}]  ${x.page}`);
}
console.log('   게이트: node pipeline/publish/check-numbers.mjs');

console.log('');
console.log('⚠️ 위쪽 대장(①형)은 **자동 판정이 아니다.** 마커가 주장에 붙어 있어서');
console.log('   문장을 읽고 「이 숫자가 미검증인가, 해석이 미검증인가」를 사람이 가른다.');
console.log('   숫자 쪽이면 ② 표기로 옮긴다 — 그때부터 게이트가 지킨다.');

// ── ④ 위키 페이지 자동 생성 구간 갱신 ──
if (process.argv.includes('--write')) {
  if (!existsSync(TARGET)) {
    console.error(`\n⛔ 대상 페이지가 없다: ${TARGET}`);
    console.error('   손으로 쓰는 머리말(규칙)이 있어야 하므로 페이지를 먼저 만든다.');
    process.exit(0);
  }
  const START = '<!-- AUTO:START — lint-claims.mjs 가 이 구간만 덮어쓴다. 위쪽 규칙은 손으로 쓴다. -->';
  const END = '<!-- AUTO:END -->';
  const src = readFileSync(TARGET, 'utf8');
  if (!src.includes(START) || !src.includes(END)) {
    console.error(`\n⛔ ${path.basename(TARGET)} 에 AUTO:START/END 표시가 없다 — 덮어쓰지 않았다.`);
    process.exit(0);
  }

  const groups = {};
  for (const c of claims) {
    const key = c.folder;
    (groups[key] ||= []).push(c);
  }
  const out = [];
  out.push(`> 생성 시각 기준 **${claims.length}건**. 마커별 — ${Object.entries(byMarker).sort((a, b) => b[1] - a[1]).map(([k, v]) => `\`[${k}]\` ${v}`).join(' · ')}`);
  out.push('');
  for (const [folder, list] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
    out.push(`### ${folder} — ${list.length}건`);
    out.push('');
    out.push('| 숫자 | 마커 | 페이지 | 문장 |');
    out.push('|---|---|---|---|');
    for (const c of list.slice(0, 40)) {
      const t = c.text.replace(/\|/g, '\\|').slice(0, 130);
      out.push(`| ${c.numbers.slice(0, 3).join(' · ')} | ${c.markers.join('·')} | 「${c.page}」 | ${t} |`);
    }
    if (list.length > 40) out.push(`\n… 그 외 ${list.length - 40}건 (전량은 \`node pipeline/vault/lint-claims.mjs\`)`);
    out.push('');
  }

  const head = src.slice(0, src.indexOf(START) + START.length);
  const tail = src.slice(src.indexOf(END));
  writeFileSync(TARGET, `${head}\n\n${out.join('\n')}\n${tail}`, 'utf8');
  console.log(`\n✅ 갱신: ${path.relative(ROOT, TARGET)} (자동 구간만)`);
}

process.exit(0);
