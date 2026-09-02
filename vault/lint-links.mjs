// lint-links.mjs — 볼트 링크·고아·frontmatter·index 등재 검사. (2026-08-21 9차 린트에서 영구화)
//
// ⛔ 왜 이 파일이 여기 있나:
//   7차(8/14)·8차(8/21) 린트가 **같은 오탐을 두 번 겪었다**. 8차는 *"이번에 lint-links.mjs로
//   범위를 볼트 전체로 잡아 다시 짰다"*고 기록했지만 **파일을 남기지 않았다.**
//   9차가 찾아보니 리포에 없었다 → 또 짜야 했다. 8차 본인도 *"7차에서 똑같이 겪었는데
//   스크립트를 안 고쳐놨다"*고 적어놨다. **4주 연속 같은 일이다.**
//   → 오늘의 결론(「재현 가능하게 남긴다」)을 린트 도구 자신에게 적용한다.
//
// ★ 핵심 교훈 2개가 코드에 박혀 있다:
//   ① 링크 대상 인덱스는 **볼트 전체**(wiki + raw-sources)다.
//      wiki만 세면 깨진 링크가 67개로 나오는데 raw-sources를 넣으면 17개다.
//      「<수집 문서>」 계열이 전부 raw-sources에 있어서 옵시디언에서는 정상 해결된다.
//   ② **알려진 오탐을 코드에 내장한다.** 매주 사람이 손으로 걸러내지 않게.
//
// 사용: node lint-links.mjs            요약
//       node lint-links.mjs --verbose  깨진 링크·고아 전량

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ★ 볼트 경로를 바꿔 낄 수 있다 (2026-08-26).
//   종전에는 폴더 이름이 박혀 있어서 **볼트 이름이 다르면 못 돌았다.**
//   같은 폴더의 lint-repo.mjs 는 이미 argv 로 경로를 받고 있었다 — 셋 중 둘만 굳어 있었다.
//   기본값은 그대로라 우리 실행 방식은 안 바뀐다.
const vi = process.argv.indexOf('--vault');
const VAULT = vi >= 0 && process.argv[vi + 1]
  ? path.resolve(process.cwd(), process.argv[vi + 1])
  : path.resolve(HERE, '../../second-brain');
const WIKI = path.join(VAULT, 'wiki');
const RAW = path.join(VAULT, 'raw-sources');

// ⛔ 없는 경로를 줘도 조용히 빈 리포트가 나오면 「깨끗한 볼트」로 읽힌다 (2026-08-26).
//   경로를 잘못 친 것과 문제가 없는 것은 화면에서 구분이 안 됐다.
if (!existsSync(WIKI)) {
  console.error(`⛔ wiki 폴더가 없다: ${WIKI}`);
  console.error(`   --vault <볼트경로> 로 지정한다. 볼트 안에 wiki/ 가 있어야 한다.`);
  process.exit(1);
}

const verbose = process.argv.includes('--verbose');

// ── 알려진 오탐 (8차 린트에서 확정. 새로 판정한 것만 추가한다) ────────
const KNOWN_FALSE_POSITIVES = {
  // 자기 참조: 이전 린트·로그가 "깨진 링크"를 인용하며 언급한 것
  selfRefFiles: new Set(['lint-report.md', 'log.md']),
  // 약칭 — 실제 페이지는 날짜가 붙어 있다
  aliases: new Set([
    '터진 콘텐츠 벤치마킹 10선', '구글 애드센스 블로그 조사',
    'autoTHREADS 요약', '데일리 브리핑',
  ]),
  // 자산·코드 이름, 총칭·기호
  notPages: new Set(['링크', '위키링크', '시간%, 시청자%', 'char-boy-navy-P']),
};
// 볼트 밖(메모리·스킬·코드)을 가리키는 이름 — 8차 규칙: log.md에 쓰지 않는다
const OUTSIDE_VAULT = /^(vault-|feedback-|infra-|project-|user-)/;

const walk = (dir, ext = null) => {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) { if (!e.endsWith('_files')) out.push(...walk(p, ext)); }
    else if (!ext || e.endsWith(ext)) out.push(p);
  }
  return out;
};

const ROOT_EXEMPT = new Set(['index', 'log', 'lint-report']);
const wikiFiles = walk(WIKI, '.md');
const rawFiles = walk(RAW, '.md');

// ── 링크 대상 인덱스 = 볼트 전체, **확장자 무관** ────────────────────
// ⚠️ 3차 교훈(log.md 8451행): `.md`만 색인하면 `「…pdf」`가 오탐으로 잡힌다.
//    옵시디언은 PDF·PNG·HTML도 링크 대상으로 해결한다. 여기서 또 틀렸다 —
//    9차 1회차 실행이 PDF 링크를 "깨짐"으로 보고했고, 그 판정은 이미 log.md에 있었다.
//    ★ 판정이 log.md에만 있으면 다음 회차가 또 겪는다. 그래서 코드로 옮긴다.
const allVaultFiles = [...walk(WIKI), ...walk(RAW)];
const targets = new Set();
for (const f of allVaultFiles) {
  const b = path.basename(f);
  targets.add(b);                              // 확장자 포함 (예: …pdf)
  targets.add(b.replace(/\.[^.]+$/, ''));      // 확장자 제거 (예: 페이지 제목)
}

// ── 스캔 ─────────────────────────────────────────────────────────────
const inbound = new Map(wikiFiles.map((f) => [path.basename(f, '.md'), 0]));
const broken = [];
const known = [];   // 아는 오탐(메모리 링크·코드 파일명). 따로 센다 — 위 10차 주석 참조.
const noFrontmatter = [];
const staleness = [];
let linkTotal = 0;

// ★ 인라인 코드·코드블록 안의 위키링크는 링크가 아니다.
//   9차 실측: 깨진 링크로 잡힌 2건이 **둘 다 백틱 안**이었다 —
//     · `「...」` = *"152개 원본이 이미 `「...」`로 촘촘히 엮여 있다"* (위키링크 문법의 총칭)
//     · `「이북 제작 파이프라인」` = *"(원래 `「…」`도 걸어뒀으나 그런 페이지를 만든 적이 없어…)"*
//   ⚠️ 오탐의 원인이 **하드코딩 예외 목록이 아니라 파싱**이었다. 8차·7차가 예외를 손으로
//      늘려온 게 근본 처방이 아니었다는 뜻이다. 여기서 파서를 고친다.
const stripCode = (s) => s
  .replace(/```[\s\S]*?```/g, '')   // 코드블록
  .replace(/`[^`\n]*`/g, '');       // 인라인 코드

for (const f of wikiFiles) {
  const name = path.basename(f, '.md');
  const raw = readFileSync(f, 'utf8');
  const text = stripCode(raw);
  const base = path.basename(f);

  // index·log·lint-report는 카탈로그/로그 파일이라 frontmatter 규칙 대상이 아니다(7차 확정)
  if (!raw.startsWith('---') && !ROOT_EXEMPT.has(name)) noFrontmatter.push(name);
  const upd = raw.match(/^updated:\s*(\d{4}-\d{2}-\d{2})/m);
  staleness.push([name, upd ? upd[1] : '(없음)']);

  for (const m of text.matchAll(/\[\[([^\]|#]+)/g)) {
    const t = m[1].trim();
    linkTotal++;
    if (targets.has(t)) {
      if (t !== name && inbound.has(t)) inbound.set(t, inbound.get(t) + 1);
      continue;
    }
    // 오탐 필터
    if (KNOWN_FALSE_POSITIVES.selfRefFiles.has(base)) continue;
    if (KNOWN_FALSE_POSITIVES.aliases.has(t)) continue;
    if (KNOWN_FALSE_POSITIVES.notPages.has(t)) continue;
    // ⛔⛔ 2026-08-28 (10차): **아는 오탐을 「깨짐」에 같이 담지 않는다.**
    //   종전에는 메모리 링크(`「feedback-*」` 등)와 코드 파일 이름도 `broken` 에 밀어넣어
    //   헤더가 **「깨진 링크 18」** 로 찍혔다. 그런데 **진짜 깨진 건 1건**이었고
    //   ★★★ 그 1건이 **0바이트 페이지**였다 — 콜론(`:`)이 든 제목이라 파일명이
    //        확장자까지 잘려 `.md` 가 없었고, 그래서 이 린터의 walk 에도 안 잡혔다.
    //        index 에는 긴 항목으로 등재돼 있고 log 는 「신설」이라 적었는데 **내용이 0바이트**였다.
    //   ★★ 15시간 동안 아무도 못 봤다. **오탐 16건에 묻혀서**다.
    //   ▶ 규칙: **아는 오탐은 따로 센다.** 사람이 매주 보는 숫자는 「진짜」만이어야 한다.
    if (OUTSIDE_VAULT.test(t)) { known.push([base, t, '볼트 밖(메모리/스킬)']); continue; }
    if (/\.(pdf|png|jpg|mjs|js|json|md)$/i.test(t)) { known.push([base, t, '파일 이름']); continue; }
    broken.push([base, t, '대상 없음']);
  }
}

// ── index.md 등재 여부 ───────────────────────────────────────────────
const indexText = existsSync(path.join(WIKI, 'index.md')) ? readFileSync(path.join(WIKI, 'index.md'), 'utf8') : '';
// ⚠️ 데일리 브리핑은 index가 「최근 7일」만 등재하는 규칙이라 미등재가 정상이다(9차 확정).
//    25건이 매번 경보로 뜨면 사람이 목록 전체를 무시하게 된다 — 그래서 코드에서 면제한다.
const notInIndex = wikiFiles
  .map((f) => path.basename(f, '.md'))
  .filter((n) => !ROOT_EXEMPT.has(n)
    && !/^데일리 브리핑 \d{4}-\d{2}-\d{2}$/.test(n)
    && !indexText.includes(`「${n}」`));

// ── 고아 ─────────────────────────────────────────────────────────────
const orphans = [...inbound].filter(([n, c]) => c === 0 && !ROOT_EXEMPT.has(n)).map(([n]) => n);

// ── 출력 ─────────────────────────────────────────────────────────────
console.log(`볼트: wiki ${wikiFiles.length}개 · raw-sources ${rawFiles.length}개 · 링크 ${linkTotal}건\n`);

// ⛔⛔ 2026-08-28 (10차) 신설 — **파일 자체의 이상**을 본다. 링크만 보면 못 잡는 게 있다.
//   ① **0바이트 페이지**: 등재도 되고 링크도 걸렸는데 **내용이 없다.**
//      실제로 하나 있었다(MiniMax H3, 08-27 19:13, 커밋까지 됐다). 15시간 아무도 몰랐다.
//   ② **wiki 안의 비-`.md` 파일**: 제목에 콜론(`:`)이 들어가면 윈도우가 파일명을 자르는데,
//      **확장자까지 잘려 나간다.** 그러면 `walk(WIKI,'.md')` 에 안 잡혀 **볼트 도구 전부에서 사라진다.**
//      ★ 링크는 「대상 없음」으로 뜨지만 그건 오탐 더미에 묻힌다 — 그래서 파일 쪽에서도 본다.
const allWikiEntries = walk(WIKI);
const emptyPages = allWikiEntries.filter((f) => statSync(f).size === 0);
const notMd = allWikiEntries.filter((f) => !f.endsWith('.md'));

const line = (label, n, note = '') => console.log(`  ${label.padEnd(24)} ${String(n).padStart(4)}${note ? '  ' + note : ''}`);
line('깨진 링크 (진짜)', broken.length);
line('0바이트 페이지', emptyPages.length, emptyPages.length ? '⛔ 등재돼 있어도 내용이 없다' : '');
line('wiki 내 비-.md 파일', notMd.length, notMd.length ? '⛔ 제목의 : 로 확장자가 잘렸을 수 있다' : '');
line('고아 (인바운드 0)', orphans.length);
line('frontmatter 누락', noFrontmatter.length);
line('index.md 미등재', notInIndex.length);
line('아는 오탐 (참고)', known.length, '메모리 링크·코드 파일명 — 깨짐에 안 센다');

if (emptyPages.length) {
  console.log('\n⛔⛔ 0바이트 페이지 — **내용이 없다. 링크·index 는 멀쩡해 보인다.**');
  for (const f of emptyPages) console.log(`  ${path.relative(WIKI, f)}`);
}
if (notMd.length) {
  console.log('\n⛔ wiki 안에 .md 가 아닌 파일 — 볼트 도구가 이 파일을 못 본다');
  for (const f of notMd) console.log(`  ${path.relative(WIKI, f)}`);
}
if (broken.length) {
  console.log('\n⛔ 깨진 링크 (진짜)');
  for (const [file, t, why] of broken) console.log(`  ${file} → 「${t}」  (${why})`);
}
if (process.argv.includes('--verbose') && known.length) {
  console.log('\n· 아는 오탐 (참고용, 조치 대상 아님)');
  for (const [file, t, why] of known) console.log(`  ${file} → 「${t}」  (${why})`);
}
if (orphans.length) {
  console.log('\n⚠️ 고아 페이지');
  orphans.forEach((n) => console.log(`  ${n}`));
}
if (noFrontmatter.length) {
  console.log('\n⛔ frontmatter 없음');
  noFrontmatter.forEach((n) => console.log(`  ${n}`));
}
if (notInIndex.length) {
  console.log('\n⚠️ index.md 미등재');
  notInIndex.forEach((n) => console.log(`  ${n}`));
}

// updated 분포
const byMonth = new Map();
for (const [, d] of staleness) {
  const k = d === '(없음)' ? '(없음)' : d.slice(0, 7);
  byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
}
console.log('\nupdated 분포');
for (const [k, n] of [...byMonth].sort()) console.log(`  ${k}  ${String(n).padStart(4)}개`);

if (verbose) {
  const old = staleness.filter(([, d]) => d !== '(없음)' && d < '2026-08-01').sort((a, b) => a[1].localeCompare(b[1]));
  console.log(`\n8월 이전 갱신 페이지 ${old.length}개 (오래됨 ≠ 틀림 — 8차 판정 유지)`);
  old.slice(0, 20).forEach(([n, d]) => console.log(`  ${d}  ${n}`));
  if (old.length > 20) console.log(`  … 외 ${old.length - 20}개`);
}

if (broken.length || noFrontmatter.length) process.exitCode = 1;
